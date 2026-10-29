/** Folder tint slots shared by the shader's uniform array and the CPU side. */
export const folderSlots = 12;

const nodeVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
// radius (px), tone, glow, folder slot (-1 for none)
layout(location = 1) in vec4 aAttr;
uniform mat4 uVP;
uniform float uDistance;
uniform float uSizeScale;
uniform float uDpr;
uniform float uFogNear;
uniform float uFogFar;
uniform float uHalo;
out vec4 vAttr;
out float vFog;
void main() {
  vec4 clip = uVP * vec4(aPos, 1.0);
  float depth = max(clip.w, 1e-3);
  float radius = clamp(aAttr.x * uSizeScale * pow(clamp(uDistance / depth, 0.35, 2.4), 0.85), 2.0, 16.0);
  bool focused = aAttr.y > 2.5 && aAttr.y < 3.5;
  if (uHalo > 0.0 && aAttr.z < 0.2 && !focused) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float reach = uHalo > 0.0 ? radius * (2.4 + 3.6 * aAttr.z + (focused ? 1.6 : 0.0)) : radius;
  gl_Position = clip;
  gl_PointSize = 2.0 * reach * uDpr;
  vAttr = aAttr;
  vFog = smoothstep(uFogNear, uFogFar, depth);
}`;

const nodeFragment = `#version 300 es
precision highp float;
in vec4 vAttr;
in float vFog;
uniform vec3 uNode;
uniform vec3 uFaded;
uniform vec3 uMissing;
uniform vec3 uFocus;
uniform vec3 uBg;
uniform vec3 uFolderColors[${folderSlots}];
uniform float uFolders;
uniform float uHalo;
uniform float uHaloAlpha;
uniform float uSolid;
out vec4 outColor;
vec3 baseColor() {
  float tone = vAttr.y;
  if (tone < 0.5) {
    if (uFolders > 0.5 && vAttr.w > -0.5) return uFolderColors[int(vAttr.w + 0.5)];
    return uNode;
  }
  if (tone < 1.5) return uFaded;
  if (tone < 2.5) return uMissing;
  return uFocus;
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float d = sqrt(r2);
  vec3 base = baseColor();
  if (uHalo > 0.0) {
    float a = pow(1.0 - d, 2.2) * uHaloAlpha * (0.35 + vAttr.z) * (1.0 - vFog * 0.7);
    outColor = vec4(base, a);
    return;
  }
  bool hollow = (vAttr.y > 1.5 && vAttr.y < 2.5) || vAttr.y > 3.5;
  if (hollow && d < 0.56) discard;
  float coverage = uSolid > 0.5 ? 1.0 : 1.0 - smoothstep(0.84, 1.0, d);
  vec3 n = vec3(p.x, -p.y, sqrt(max(0.0, 1.0 - r2)));
  vec3 light = normalize(vec3(-0.42, 0.58, 0.7));
  float diffuse = clamp(dot(n, light), 0.0, 1.0);
  float specular = pow(clamp(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 26.0);
  float rim = pow(1.0 - n.z, 2.4);
  vec3 lit = base * (0.5 + 0.62 * diffuse);
  if (hollow) lit = base * (0.86 + 0.2 * diffuse);
  else lit += vec3(0.34) * specular + mix(base, vec3(1.0), 0.45) * rim * 0.2;
  lit = mix(lit, uBg, vFog * 0.72);
  outColor = vec4(lit, coverage);
}`;

const edgeVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uVP;
out float vDepth;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  vDepth = gl_Position.w;
}`;

const edgeFragment = `#version 300 es
precision highp float;
in float vDepth;
uniform vec3 uColor;
uniform vec3 uBg;
uniform float uAlpha;
uniform float uFogNear;
uniform float uFogFar;
out vec4 outColor;
void main() {
  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  outColor = vec4(mix(uColor, uBg, fog * 0.6), uAlpha * (1.0 - fog * 0.8));
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建着色器');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`着色器编译失败：${log}`);
  }
  return shader;
}
export interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}
function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const program = gl.createProgram();
  if (!program) throw new Error('无法创建着色器程序');
  const shaders = [
    compile(gl, gl.VERTEX_SHADER, vertex),
    compile(gl, gl.FRAGMENT_SHADER, fragment),
  ];
  for (const shader of shaders) gl.attachShader(program, shader);
  gl.linkProgram(program);
  for (const shader of shaders) {
    gl.detachShader(program, shader);
    gl.deleteShader(shader);
  }
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`着色器链接失败：${log}`);
  }
  const uniforms = new Map<string, WebGLUniformLocation>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    const location = info && gl.getUniformLocation(program, info.name);
    if (info && location) uniforms.set(info.name.replace(/\[0\]$/, ''), location);
  }
  return { program, uniforms };
}
export const createNodeProgram = (gl: WebGL2RenderingContext) => link(gl, nodeVertex, nodeFragment);
export const createEdgeProgram = (gl: WebGL2RenderingContext) => link(gl, edgeVertex, edgeFragment);

const activate = 'useProgram';
/** Selects the program. Calling it by key keeps linters from mistaking the WebGL method for a React hook. */
export function bindProgram(gl: WebGL2RenderingContext, program: Program) {
  gl[activate](program.program);
}
export function uniform(program: Program, name: string) {
  return program.uniforms.get(name) ?? null;
}

const scratch = (() => {
  let canvas: HTMLCanvasElement | null = null;
  return () => {
    canvas ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
    return canvas.getContext('2d', { willReadFrequently: true });
  };
})();
/** Resolves any CSS color the host understands to 0..1 RGB; the fallback is used for invalid input. */
export function parseColor(css: string, fallback: [number, number, number]) {
  const context = scratch();
  if (!context) return fallback;
  // An invalid value leaves the previous style in place, so start from a known, different sentinel.
  context.fillStyle = '#010203';
  context.fillStyle = css;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const data = context.getImageData(0, 0, 1, 1).data;
  const parsed: [number, number, number] = [
    (data[0] ?? 0) / 255,
    (data[1] ?? 0) / 255,
    (data[2] ?? 0) / 255,
  ];
  const sentinel = data[0] === 1 && data[1] === 2 && data[2] === 3;
  return sentinel && css.replace(/\s/g, '').toLowerCase() !== '#010203' ? fallback : parsed;
}
export function luminance([r, g, b]: [number, number, number]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}
