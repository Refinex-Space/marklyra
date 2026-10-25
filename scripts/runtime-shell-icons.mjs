import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEARCH_ICON_MANIFEST, SHELL_ICON_MANIFEST } from './runtime-shell-icon-manifest.mjs';

export { SHELL_ICON_MANIFEST };
export const SHELL_ICON_PREFIX = '/__runtime-icons/';
const defaultSource = fileURLToPath(
  new URL('../packages/editor-runtime/assets/styles/', import.meta.url),
);
const defaultPage = fileURLToPath(new URL('../packages/editor-runtime/src/page/', import.meta.url));
const privateRoot = fileURLToPath(new URL('../private/', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function readInput(root, relativePath) {
  try {
    const path = resolve(root, relativePath);
    const [metadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !canonical.startsWith(`${root}${sep}`))
      throw new Error('not a regular source input');
    return await readFile(path);
  } catch (error) {
    throw new Error(
      `Runtime shell icon input unavailable (${relativePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function verifiedResources(sourceDirectory, pageDirectory) {
  const root = await realpath(sourceDirectory).catch(() => {
    throw new Error('Runtime shell icon sources are missing from the editor package');
  });
  const results = await Promise.allSettled(
    SHELL_ICON_MANIFEST.map(async (font) => {
      const bytes = await readInput(root, font.path);
      return [font.path, { bytes, type: 'font/woff', sha256: digest(bytes) }];
    }),
  );
  const resources = new Map();
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
    resources.set(...result.value);
  }
  const pageRoot = await realpath(pageDirectory);
  const html = (await readInput(pageRoot, 'index.html')).toString('utf8');
  const symbols = SEARCH_ICON_MANIFEST.map(({ name }) => {
    const matches = [
      ...html.matchAll(
        new RegExp(`<symbol id="find-and-replace-icon-${name}"[^>]*>[\\s\\S]*?</symbol>`, 'g'),
      ),
    ];
    if (matches.length !== 1) throw new Error(`Expected one runtime search icon: ${name}`);
    return matches[0][0];
  });
  const searchIcons = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('\n')}</svg>`,
  );
  resources.set('search-options.svg', {
    bytes: searchIcons,
    type: 'image/svg+xml',
    sha256: digest(searchIcons),
  });
  const css = Buffer.from(
    SHELL_ICON_MANIFEST.map(
      (font) =>
        `@font-face{font-family:${JSON.stringify(font.family)};font-style:normal;font-weight:400;font-display:block;src:url(${JSON.stringify(`./${font.path}`)}) format("woff");}`,
    ).join('\n'),
  );
  resources.set('icons.css', { bytes: css, type: 'text/css; charset=utf-8', sha256: digest(css) });
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

/** Desktop icon assets, separate from the six built-in text fonts. */
export function runtimeShellIcons({
  sourceDirectory = defaultSource,
  pageDirectory = defaultPage,
} = {}) {
  let pending;
  let building = false;
  const resources = () => (pending ??= verifiedResources(sourceDirectory, pageDirectory));
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
              `${resolve(pageDirectory).split(sep).join('/')}/**`,
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
