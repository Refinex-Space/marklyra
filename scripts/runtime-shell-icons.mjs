import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL_ICON_MANIFEST } from './runtime-shell-icon-manifest.mjs';

export { SHELL_ICON_MANIFEST };
export const SHELL_ICON_PREFIX = '/__runtime-icons/';
const defaultSource = fileURLToPath(new URL('../private/runtime-assets/style/', import.meta.url));
const privateRoot = fileURLToPath(new URL('../private/', import.meta.url));
const licenseSource = fileURLToPath(new URL('../licenses/', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reviewedNotices = [
  {
    source: 'icons/FONT-NOTICES.txt',
    file: 'icon-notices.txt',
    sha256: 'af0c3b5f101331c91f86b7aed2aa6194a51f70ed099588d0398506ecb0e723b9',
  },
  {
    source: 'fonts/OFL-1.1.txt',
    file: 'fontawesome-OFL.txt',
    sha256: 'ebc109078c06f79af74cf2b27454c262830d12a65749f0e2bf25d1ac1db7a02a',
  },
];
const ioniconsNotice = {
  path: 'ionicons-2.0.1/LICENSE',
  sha256: '5407c91b6c8b7305f72aec4ee5ffb99b32ed9a5413c19cf3cd1b94354d2645e8',
};

async function verifiedInput(root, relativePath, expectedHash, expectedBytes) {
  try {
    const path = resolve(root, relativePath);
    const [metadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !canonical.startsWith(`${root}${sep}`))
      throw new Error('not a regular private input');
    const bytes = await readFile(path);
    if (
      digest(bytes) !== expectedHash ||
      (expectedBytes !== undefined && bytes.length !== expectedBytes)
    )
      throw new Error('identity mismatch');
    return bytes;
  } catch (error) {
    throw new Error(
      `Runtime shell icon input unavailable (${relativePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function verifiedResources(sourceDirectory) {
  const root = await realpath(sourceDirectory).catch(() => {
    throw new Error('Runtime shell icons are missing; restore the private runtime inputs');
  });
  const results = await Promise.allSettled(
    SHELL_ICON_MANIFEST.map(async (font) => [
      font.path,
      {
        bytes: await verifiedInput(root, font.path, font.sha256, font.bytes),
        type: 'font/woff',
        sha256: font.sha256,
      },
    ]),
  );
  const resources = new Map();
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
    resources.set(...result.value);
  }
  const notice = await verifiedInput(root, ioniconsNotice.path, ioniconsNotice.sha256);
  resources.set('licenses/ionicons-MIT.txt', {
    bytes: notice,
    type: 'text/plain; charset=utf-8',
    sha256: ioniconsNotice.sha256,
  });
  const licenses = await realpath(licenseSource);
  for (const record of reviewedNotices) {
    resources.set(`licenses/${record.file}`, {
      bytes: await verifiedInput(licenses, record.source, record.sha256),
      type: 'text/plain; charset=utf-8',
      sha256: record.sha256,
    });
  }
  const css = Buffer.from(
    SHELL_ICON_MANIFEST.map(
      (font) =>
        `@font-face{font-family:${JSON.stringify(font.family)};font-style:normal;font-weight:400;font-display:block;src:url(${JSON.stringify(`./${font.path}`)}) format("woff");}`,
    ).join('\n'),
  );
  resources.set('icons.css', { bytes: css, type: 'text/css; charset=utf-8', sha256: digest(css) });
  const provenance = Buffer.from(
    `${JSON.stringify(
      {
        purpose:
          'Private desktop resources; separate review required for SDK or public distribution',
        source: 'Typora 1.11.7 / 7472 shipped style resources, unchanged font bytes',
        fonts: SHELL_ICON_MANIFEST,
        notices: [
          { file: 'licenses/ionicons-MIT.txt', sha256: ioniconsNotice.sha256 },
          ...reviewedNotices.map((record) => ({
            file: `licenses/${record.file}`,
            sha256: record.sha256,
          })),
        ],
        unreviewed:
          'Typora icon redistribution rights and Ionicons conversion lineage remain unresolved; no public bundle approval',
      },
      null,
      2,
    )}\n`,
  );
  resources.set('provenance.json', {
    bytes: provenance,
    type: 'application/json; charset=utf-8',
    sha256: digest(provenance),
  });
  return resources;
}

function middleware(resources) {
  return (request, response, next) => {
    const path = (request.url ?? '').split('?')[0];
    const stem = SHELL_ICON_PREFIX.slice(0, -1);
    if (path !== stem && !path.startsWith(SHELL_ICON_PREFIX) && !path.startsWith(`${stem}%`))
      return next();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end('Method not allowed');
      return;
    }
    const name = path.slice(SHELL_ICON_PREFIX.length);
    if (
      !path.startsWith(SHELL_ICON_PREFIX) ||
      path.includes('%') ||
      path.includes('\\') ||
      name.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      response.statusCode = 400;
      response.end('Invalid runtime icon path');
      return;
    }
    const resource = resources.get(name);
    if (!resource) {
      response.statusCode = 404;
      response.end('Unknown runtime icon');
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

/** Private desktop assets, deliberately separate from the audited 24 text fonts. */
export function runtimeShellIcons({ sourceDirectory = defaultSource } = {}) {
  let pending;
  let building = false;
  const resources = () => (pending ??= verifiedResources(sourceDirectory));
  return {
    name: 'runtime-shell-icons',
    enforce: 'pre',
    configResolved(config) {
      building = config.command === 'build';
    },
    config(config) {
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
          fileName: `${SHELL_ICON_PREFIX.slice(1)}${name}`,
          source: resource.bytes,
        });
    },
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: {
            id: 'runtime-shell-icons',
            rel: 'stylesheet',
            href: `${SHELL_ICON_PREFIX}icons.css`,
          },
          injectTo: 'head',
        },
      ];
    },
  };
}
