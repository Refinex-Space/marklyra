import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL_FONT_MANIFEST } from './runtime-shell-font-manifest.mjs';

export { SHELL_FONT_MANIFEST };
export const SHELL_FONT_PREFIX = '/__runtime-fonts/';
export const SHELL_FONT_LICENSE_PREFIX = '/__runtime-fonts/licenses/fonts/';
const defaultSource = fileURLToPath(new URL('../private/runtime-assets/style/', import.meta.url));
const defaultLicenses = fileURLToPath(new URL('../licenses/fonts/', import.meta.url));
const privateRoot = fileURLToPath(new URL('../private/', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Audit metadata is pinned as well as the received notices, so changing the mapping
// and its declared notice hashes together cannot silently bypass the build gate.
const LICENSE_METADATA = {
  'manifest.json': '2c5d09fe634efcaf524f9e4a6b906e56793450e4bf7b596be3d6fdd6b46708e8',
  'README.md': 'affe3fff84de2b3965928882d62fb5b08ce918eb143cb9a337e6867b63429613',
};
const LICENSE_NOTICES = [
  'Apache-2.0.txt',
  'FONT-NOTICES.txt',
  'GUST-FONT-LICENSE-1.0.txt',
  'GUST-FONT-LICENSE-2006.txt',
  'LPPL-1.3c.txt',
  'OFL-1.1.txt',
  'Raleway-3.000g-OFL.txt',
];

async function licenseInput(root, name, expectedSha256) {
  try {
    const path = resolve(root, name);
    const [metadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !canonical.startsWith(`${root}${sep}`))
      throw new Error('not a regular license input');
    const bytes = await readFile(path);
    if (digest(bytes) !== expectedSha256) throw new Error('SHA-256 mismatch');
    return {
      bytes,
      type:
        name === 'manifest.json'
          ? 'application/json; charset=utf-8'
          : name === 'README.md'
            ? 'text/markdown; charset=utf-8'
            : 'text/plain; charset=utf-8',
      sha256: expectedSha256,
    };
  } catch (error) {
    throw new Error(
      `Runtime shell font license input unavailable (${name}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateLicenseMapping(manifest, resources) {
  const notices = new Map();
  if (
    !Array.isArray(manifest.noticeFiles) ||
    manifest.noticeFiles.length !== LICENSE_NOTICES.length
  )
    throw new Error('Runtime shell font license notice inventory mismatch');
  for (const notice of manifest.noticeFiles) {
    if (
      !notice ||
      !LICENSE_NOTICES.includes(notice.file) ||
      notices.has(notice.file) ||
      !/^[a-f0-9]{64}$/.test(notice.sha256)
    )
      throw new Error('Runtime shell font license notice inventory mismatch');
    notices.set(notice.file, notice.sha256);
  }
  const fonts = new Map(SHELL_FONT_MANIFEST.map((font) => [font.path, font]));
  const seen = new Set();
  const referencedNotices = new Set();
  if (
    fonts.size !== 24 ||
    SHELL_FONT_MANIFEST.length !== 24 ||
    !Array.isArray(manifest.fonts) ||
    manifest.fonts.length !== fonts.size
  )
    throw new Error('Runtime shell font license/font correspondence mismatch');
  for (const licensed of manifest.fonts) {
    const font = fonts.get(licensed?.path);
    if (
      !font ||
      seen.has(licensed.path) ||
      licensed.sha256 !== font.sha256 ||
      licensed.family !== font.family ||
      licensed.bytes !== resources.get(font.path)?.bytes.length ||
      typeof licensed.license !== 'string' ||
      !licensed.license ||
      !Array.isArray(licensed.licenseTextFiles) ||
      !licensed.licenseTextFiles.length ||
      new Set(licensed.licenseTextFiles).size !== licensed.licenseTextFiles.length ||
      licensed.licenseTextFiles.some((file) => !notices.has(file))
    )
      throw new Error('Runtime shell font license/font correspondence mismatch');
    seen.add(licensed.path);
    for (const file of licensed.licenseTextFiles) referencedNotices.add(file);
  }
  if (referencedNotices.size !== notices.size)
    throw new Error('Runtime shell font license notice references are incomplete');
  return notices;
}

async function addLicenseResources(resources, licenseDirectory) {
  const root = await realpath(licenseDirectory).catch(() => {
    throw new Error(
      'Runtime shell font licenses are missing; restore licenses/fonts before serving or building desktop',
    );
  });
  const metadata = await Promise.all(
    Object.entries(LICENSE_METADATA).map(async ([name, sha256]) => [
      name,
      await licenseInput(root, name, sha256),
    ]),
  );
  const manifest = JSON.parse(
    metadata.find(([name]) => name === 'manifest.json')[1].bytes.toString('utf8'),
  );
  const notices = validateLicenseMapping(manifest, resources);
  const results = await Promise.allSettled(
    [...notices].map(async ([name, sha256]) => [name, await licenseInput(root, name, sha256)]),
  );
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
    metadata.push(result.value);
  }
  for (const [name, resource] of metadata) resources.set(`licenses/fonts/${name}`, resource);
}

function fontStylesheet() {
  return SHELL_FONT_MANIFEST.map((font) => {
    const format = font.mime === 'font/woff2' ? 'woff2' : 'woff';
    return `@font-face{font-family:${JSON.stringify(font.family)};font-style:${font.style};font-weight:${font.weight};src:url(${JSON.stringify(`./${font.path}`)}) format(${JSON.stringify(format)});${font.unicodeRange ? `unicode-range:${font.unicodeRange};` : ''}}`;
  }).join('\n');
}

async function verifiedResources(sourceDirectory, licenseDirectory) {
  const root = await realpath(sourceDirectory).catch(() => {
    throw new Error(
      'Runtime shell fonts are missing; restore the private runtime font inputs before serving or building desktop',
    );
  });
  const results = await Promise.allSettled(
    SHELL_FONT_MANIFEST.map(async (font) => {
      const path = resolve(root, font.path);
      const [metadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
      if (!metadata.isFile() || metadata.isSymbolicLink() || !canonical.startsWith(`${root}${sep}`))
        throw new Error(`Runtime shell font is not a regular private input: ${font.path}`);
      const bytes = await readFile(path);
      if (digest(bytes) !== font.sha256)
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
  await addLicenseResources(resources, licenseDirectory);
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

/** Desktop-only delivery. Does not copy private bytes into source trees or SDK packages. */
export function runtimeShellFonts({
  sourceDirectory = defaultSource,
  licenseDirectory = defaultLicenses,
} = {}) {
  let pending;
  let building = false;
  const resources = () => (pending ??= verifiedResources(sourceDirectory, licenseDirectory));
  return {
    name: 'runtime-shell-fonts',
    enforce: 'pre',
    configResolved(config) {
      building = config.command === 'build';
    },
    config(config) {
      // Preserve Vite 7's default secret-file denials while blocking its generic
      // /@fs route from bypassing this plugin's private-resource whitelist.
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
