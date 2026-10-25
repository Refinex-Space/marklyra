import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL_FONT_MANIFEST } from './runtime-shell-font-manifest.mjs';

export { SHELL_FONT_MANIFEST };
export const SHELL_FONT_PREFIX = '/__runtime-fonts/';
const defaultSource = fileURLToPath(
  new URL('../packages/editor-runtime/assets/styles/', import.meta.url),
);
const defaultThemes = fileURLToPath(new URL('../packages/editor-themes/assets/', import.meta.url));
const privateRoot = fileURLToPath(new URL('../private/', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fontStylesheet() {
  return SHELL_FONT_MANIFEST.map((font) => {
    const format = font.mime === 'font/woff2' ? 'woff2' : 'woff';
    return `@font-face{font-family:${JSON.stringify(font.family)};font-style:${font.style};font-weight:${font.weight};src:url(${JSON.stringify(`./${font.path}`)}) format(${JSON.stringify(format)});${font.unicodeRange ? `unicode-range:${font.unicodeRange};` : ''}}`;
  }).join('\n');
}

async function verifiedResources(sourceDirectory, themeDirectory) {
  const roots = new Map();
  const sourceRoot = (directory) => {
    if (!roots.has(directory))
      roots.set(
        directory,
        (async () => {
          const metadata = await lstat(directory);
          if (!metadata.isDirectory() || metadata.isSymbolicLink())
            throw new Error('font directory must be a regular source directory');
          return realpath(directory);
        })(),
      );
    return roots.get(directory);
  };
  const results = await Promise.allSettled(
    SHELL_FONT_MANIFEST.map(async (font) => {
      const themeFont = font.path.startsWith('themes/');
      const root = await sourceRoot(themeFont ? themeDirectory : sourceDirectory);
      const path = resolve(root, themeFont ? font.path.slice('themes/'.length) : font.path);
      const [metadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
      if (!metadata.isFile() || metadata.isSymbolicLink() || !canonical.startsWith(`${root}${sep}`))
        throw new Error(`Runtime shell font is not a regular source input: ${font.path}`);
      const bytes = await readFile(path);
      if (bytes.length !== font.bytes || digest(bytes) !== font.sha256)
        throw new Error(`Runtime shell font SHA-256 mismatch: ${font.path}`);
      return [font.path, { bytes, type: font.mime, sha256: font.sha256 }];
    }),
  );
  const resources = new Map();
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'rejected') {
      const error = result.reason;
      throw new Error(
        `Runtime shell font input unavailable (${SHELL_FONT_MANIFEST[index]?.path}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    resources.set(...result.value);
  }
  const css = Buffer.from(fontStylesheet());
  resources.set('fonts.css', { bytes: css, type: 'text/css; charset=utf-8', sha256: digest(css) });
  return resources;
}

function middleware(resources) {
  return (request, response, next) => {
    const path = (request.url ?? '').split('?')[0];
    const stem = SHELL_FONT_PREFIX.slice(0, -1);
    if (path !== stem && !path.startsWith(SHELL_FONT_PREFIX) && !path.startsWith(`${stem}%`))
      return next();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end('Method not allowed');
      return;
    }
    const name = path.slice(SHELL_FONT_PREFIX.length);
    if (
      !path.startsWith(SHELL_FONT_PREFIX) ||
      path.includes('%') ||
      path.includes('\\') ||
      name.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      response.statusCode = 400;
      response.end('Invalid runtime font path');
      return;
    }
    const resource = resources.get(name);
    if (!resource) {
      response.statusCode = 404;
      response.end('Unknown runtime font');
      return;
    }
    const etag = `"sha256-${resource.sha256}"`;
    response.setHeader('Content-Type', resource.type);
    response.setHeader('ETag', etag);
    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304;
      response.end();
      return;
    }
    response.setHeader('Content-Length', resource.bytes.byteLength);
    response.end(request.method === 'HEAD' ? undefined : resource.bytes);
  };
}

/** Desktop delivery directly from the owning packages' built-in font assets. */
export function runtimeShellFonts({
  sourceDirectory = defaultSource,
  themeDirectory = defaultThemes,
} = {}) {
  let pending;
  let building = false;
  const resources = () => (pending ??= verifiedResources(sourceDirectory, themeDirectory));
  return {
    name: 'runtime-shell-fonts',
    enforce: 'pre',
    configResolved(config) {
      building = config.command === 'build';
    },
    config(config) {
      // Preserve Vite 7's default secret-file denials while blocking its generic
      // /@fs route from bypassing this plugin's resource whitelist.
      return {
        server: {
          fs: {
            deny: [
              '.env',
              '.env.*',
              '*.{crt,pem}',
              '**/.git/**',
              ...(config.server?.fs?.deny ?? []),
              `${resolve(privateRoot).split(sep).join('/')}/**`,
              `${resolve(sourceDirectory).split(sep).join('/')}/**`,
              `${resolve(themeDirectory).split(sep).join('/')}/**`,
            ],
          },
        },
      };
    },
    async configureServer(server) {
      server.middlewares.use(middleware(await resources()));
    },
    async buildStart() {
      const verified = await resources();
      if (!building) return;
      for (const [name, resource] of verified)
        this.emitFile({
          type: 'asset',
          fileName: `${SHELL_FONT_PREFIX.slice(1)}${name}`,
          source: resource.bytes,
        });
    },
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: {
            id: 'runtime-shell-fonts',
            rel: 'stylesheet',
            href: `${SHELL_FONT_PREFIX}fonts.css`,
          },
          injectTo: 'head',
        },
      ];
    },
  };
}
