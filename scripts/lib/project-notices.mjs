import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '../..');
export const projectNoticeFiles = Object.freeze(['LICENSE', 'THIRD-PARTY-NOTICES.txt']);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalized = (text) => text.replace(/\s+/g, ' ').trim();

/** Share identical terms while retaining every received attribution and extra condition. */
export function sharedNoticeParts(text, projectLicense) {
  const apache = /Apache License\s+Version 2\.0[\s\S]*?END OF TERMS AND CONDITIONS/;
  const source = apache.exec(text);
  const common = apache.exec(projectLicense);
  if (source && common && normalized(source[0]) === normalized(common[0])) {
    const remainder = text.slice(source.index + source[0].length);
    const commonRemainder = projectLicense.slice(common.index + common[0].length);
    return {
      attribution: [
        text.slice(0, source.index).trim(),
        normalized(remainder) === normalized(commonRemainder) ? '' : remainder.trim(),
      ]
        .filter(Boolean)
        .join('\n\n'),
      terms: 'Apache License, Version 2.0. The complete text is supplied in LICENSE.',
    };
  }
  const grant =
    /^[ \t]*(?:Permission is hereby granted|Permission to use, copy|Redistribution and use in source and binary forms)/m.exec(
      text,
    );
  if (grant)
    return {
      attribution: text.slice(0, grant.index).trim(),
      terms: text.slice(grant.index).trim(),
    };
  return { attribution: '', terms: text.trim() };
}

async function regularDirectory(directory) {
  const info = await lstat(directory).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink())
    throw new Error('Project notices require a regular directory');
}

/** One project license and one consolidated set of required third-party notices. */
export async function readProjectNotices(root = repository) {
  await regularDirectory(root);
  const result = new Map();
  for (const name of projectNoticeFiles) {
    const path = resolve(root, name);
    const info = await lstat(path).catch(() => undefined);
    if (!info?.isFile() || info.isSymbolicLink())
      throw new Error(`Project notice must be a regular file: ${name}`);
    const bytes = await readFile(path);
    if (!bytes.length) throw new Error(`Project notice is empty: ${name}`);
    result.set(name, { bytes, sha256: digest(bytes) });
  }
  return result;
}

function identity(files) {
  return {
    projectLicenseSha256: files.get('LICENSE').sha256,
    thirdPartyNoticesSha256: files.get('THIRD-PARTY-NOTICES.txt').sha256,
    noticeFiles: 1,
  };
}

export async function copyProjectNotices(root, output) {
  const files = await readProjectNotices(root);
  await regularDirectory(output);
  // Validate both destinations before writing either file.
  for (const name of projectNoticeFiles) {
    const info = await lstat(resolve(output, name)).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (info && (!info.isFile() || info.isSymbolicLink()))
      throw new Error(`Project notice output must be a regular file: ${name}`);
  }
  for (const [name, file] of files) await writeFile(resolve(output, name), file.bytes);
  return identity(files);
}

export async function verifyProjectNotices(root, output) {
  const [expected, actual] = await Promise.all([
    readProjectNotices(root),
    readProjectNotices(output),
  ]);
  for (const name of projectNoticeFiles)
    if (expected.get(name).sha256 !== actual.get(name).sha256)
      throw new Error(`Project notice bundle mismatch: ${name}`);
  const legacy = await lstat(resolve(output, 'licenses')).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (legacy) throw new Error('Retired per-component notice directory remains in output');
  return identity(expected);
}

/** Publish the shared texts once per desktop frontend, independently of asset providers. */
export function projectNotices({ root = repository } = {}) {
  let pending;
  let building = false;
  const files = () => (pending ??= readProjectNotices(root));
  return {
    name: 'project-notices',
    configResolved(config) {
      building = config.command === 'build';
    },
    async configureServer(server) {
      const available = await files();
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        const file = available.get(path.slice(1));
        if (!path.startsWith('/') || !file) return next();
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (!['GET', 'HEAD'].includes(request.method ?? '')) {
          response.writeHead(405, { Allow: 'GET, HEAD' }).end();
          return;
        }
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-cache');
        const etag = `"sha256-${file.sha256}"`;
        response.setHeader('ETag', etag);
        if (request.headers['if-none-match'] === etag) {
          response.writeHead(304).end();
          return;
        }
        response.setHeader('Content-Length', file.bytes.length);
        response.end(request.method === 'HEAD' ? undefined : file.bytes);
      });
    },
    async buildStart() {
      const available = await files();
      if (!building) return;
      for (const [name, file] of available)
        this.emitFile({ type: 'asset', fileName: name, source: file.bytes });
    },
  };
}
