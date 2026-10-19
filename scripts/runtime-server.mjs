import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = await realpath(
  process.argv[3]
    ? resolve(process.argv[3])
    : resolve(import.meta.dirname, '../dist/editor-runtime'),
);
const port = Number(process.argv[2] ?? 4174);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};
export const runtimeCsp =
  "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'";
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const path = await realpath(resolve(root, `.${name}`));
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      res.writeHead(403).end();
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': runtimeCsp,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Editor runtime: http://127.0.0.1:${port}/index.html`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
