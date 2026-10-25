import type { Buffer } from 'node:buffer';
import type { Plugin } from 'vite';

export type ProjectNoticeFile = 'LICENSE';
export const projectNoticeFiles: readonly ProjectNoticeFile[];

export interface ProjectNoticeIdentity {
  projectLicenseSha256: string;
  noticeFiles: 1;
}

export function readProjectNotices(
  root?: string,
): Promise<Map<ProjectNoticeFile, { bytes: Buffer; sha256: string }>>;
export function copyProjectNotices(root: string, output: string): Promise<ProjectNoticeIdentity>;
export function verifyProjectNotices(root: string, output: string): Promise<ProjectNoticeIdentity>;
export function projectNotices(options?: { root?: string }): Plugin;
