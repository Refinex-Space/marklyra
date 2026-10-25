import type { Buffer } from 'node:buffer';
import type { Plugin } from 'vite';

export type ProjectNoticeFile = 'LICENSE' | 'THIRD-PARTY-NOTICES.txt';
export const projectNoticeFiles: readonly ProjectNoticeFile[];

export interface ProjectNoticeIdentity {
  projectLicenseSha256: string;
  thirdPartyNoticesSha256: string;
  noticeFiles: 1;
}

export function readProjectNotices(
  root?: string,
): Promise<Map<ProjectNoticeFile, { bytes: Buffer; sha256: string }>>;
export function copyProjectNotices(root: string, output: string): Promise<ProjectNoticeIdentity>;
export function verifyProjectNotices(root: string, output: string): Promise<ProjectNoticeIdentity>;
export function projectNotices(options?: { root?: string }): Plugin;

export function sharedNoticeParts(
  text: string,
  projectLicense: string,
): { attribution: string; terms: string };
