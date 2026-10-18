import type { DraftContent, FallbackContext, FallbackImport } from './recovery.js';

const PREFIX = 'marklyra-fallback:v2:';
const BASE = 'marklyra-fallback-base:v2:';
const MAX_CHARACTERS = 2 * 1024 * 1024;
const MAX_PATCHES = 128;
const MAX_LOG_CHARACTERS = 32 * 1024;
interface Patch {
  from: number;
  to: number;
  text: string;
}
interface Head {
  schema: 2;
  id: string;
  owner: string;
  version: number;
  updatedAt: number;
  base: string;
  patches: Patch[];
}
export interface FallbackCandidate extends FallbackImport {
  key: string;
  expected: string;
  base: string | null;
  updatedAt: number;
  active: boolean;
}
export interface FallbackListing {
  drafts: FallbackCandidate[];
  issues: string[];
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const equalDraft = (a: DraftContent, b: DraftContent) =>
  a.text === b.text &&
  a.savedText === b.savedText &&
  a.document?.path === b.document?.path &&
  a.document?.encoding === b.document?.encoding &&
  a.selection?.anchor === b.selection?.anchor &&
  a.selection?.head === b.selection?.head;
function content(value: unknown): DraftContent {
  if (
    !record(value) ||
    typeof value.text !== 'string' ||
    typeof value.savedText !== 'string' ||
    value.text.length > MAX_CHARACTERS ||
    value.savedText.length > MAX_CHARACTERS ||
    (value.document !== null &&
      (!record(value.document) ||
        typeof value.document.path !== 'string' ||
        value.document.path.length > 4096 ||
        typeof value.document.encoding !== 'string' ||
        !['UTF-8', 'UTF-8 BOM', 'UTF-16LE BOM', 'UTF-16BE BOM'].includes(
          value.document.encoding,
        ))) ||
    value.selection !== null
  )
    throw new Error('本地恢复副本格式或大小无效');
  return {
    text: value.text,
    savedText: value.savedText,
    document: value.document as DraftContent['document'],
    selection: null,
  };
}
function readHead(raw: string): Head {
  const head: unknown = JSON.parse(raw);
  if (
    !record(head) ||
    head.schema !== 2 ||
    !uuid(head.id) ||
    !uuid(head.owner) ||
    !Number.isSafeInteger(head.version) ||
    (head.version as number) < 1 ||
    !Number.isSafeInteger(head.updatedAt) ||
    typeof head.base !== 'string' ||
    !head.base.startsWith(BASE) ||
    !uuid(head.base.slice(BASE.length)) ||
    !Array.isArray(head.patches) ||
    head.patches.length > MAX_PATCHES
  )
    throw new Error('本地恢复索引无效');
  for (const patch of head.patches)
    if (
      !record(patch) ||
      !Number.isSafeInteger(patch.from) ||
      !Number.isSafeInteger(patch.to) ||
      (patch.from as number) < 0 ||
      (patch.to as number) < (patch.from as number) ||
      typeof patch.text !== 'string'
    )
      throw new Error('本地恢复增量无效');
  return head as unknown as Head;
}
function materialize(storage: Storage, head: Head): DraftContent {
  const raw = storage.getItem(head.base);
  if (!raw) throw new Error('本地恢复基线缺失，索引已保留');
  const value = content(JSON.parse(raw));
  for (const patch of head.patches) {
    if (patch.to > value.text.length) throw new Error('本地恢复增量超出基线');
    value.text = value.text.slice(0, patch.from) + patch.text + value.text.slice(patch.to);
    if (value.text.length > MAX_CHARACTERS) throw new Error('本地恢复正文超过大小上限');
  }
  return value;
}
function difference(previous: string, next: string): Patch {
  let start = 0;
  const max = Math.min(previous.length, next.length);
  while (start < max && previous.charCodeAt(start) === next.charCodeAt(start)) start++;
  let oldEnd = previous.length,
    newEnd = next.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    previous.charCodeAt(oldEnd - 1) === next.charCodeAt(newEnd - 1)
  ) {
    oldEnd--;
    newEnd--;
  }
  return { from: start, to: oldEnd, text: next.slice(start, newEnd) };
}
/** Synchronous fallback after SDK onChange. Baseline writes are copy-on-write;
 * ordinary typing writes only a bounded patch log. This is not an fsync promise. */
export class RecoveryFallback {
  private head: Head | null = null;
  private latest: DraftContent | null = null;
  private expected: string | null = null;
  constructor(
    private readonly storage: Storage,
    private readonly owner: string,
    private readonly makeId: () => string = () => crypto.randomUUID(),
    private readonly now: () => number = Date.now,
  ) {}
  update(value: DraftContent): void {
    if (this.latest && equalDraft(this.latest, value)) return;
    if (!this.head && value.text === value.savedText) return;
    content(value); // Bound before serializing or changing a durable key.
    const old = this.head;
    if (old && this.storage.getItem(PREFIX + old.id) !== this.expected)
      throw new Error('本地恢复副本已被其他操作改变，未覆盖');
    const metadataChanged =
      !this.latest ||
      this.latest.savedText !== value.savedText ||
      this.latest.document?.path !== value.document?.path ||
      this.latest.document?.encoding !== value.document?.encoding;
    const patches =
      old && !metadataChanged && this.latest
        ? [...old.patches, difference(this.latest.text, value.text)]
        : [];
    const rebase =
      !old ||
      metadataChanged ||
      patches.length > MAX_PATCHES ||
      JSON.stringify(patches).length > MAX_LOG_CHARACTERS;
    const base = rebase ? BASE + this.makeId() : old.base;
    const next: Head = {
      schema: 2,
      id: old?.id ?? this.makeId(),
      owner: this.owner,
      version: (old?.version ?? 0) + 1,
      updatedAt: this.now(),
      base,
      patches: rebase ? [] : patches,
    };
    const serialized = JSON.stringify(next);
    if (rebase) this.storage.setItem(base, JSON.stringify(value));
    // The old head remains valid if either write fails or the process stops.
    this.storage.setItem(PREFIX + next.id, serialized);
    this.head = next;
    this.expected = serialized;
    this.latest = structuredClone(value);
    if (old && old.base !== base) this.storage.removeItem(old.base);
  }
  confirm(value: DraftContent): void {
    if (this.latest && equalDraft(this.latest, value)) this.discard();
  }
  /** Only after explicit discard/successful switch or confirmed disk save. */
  discard(): void {
    try {
      if (this.head && this.storage.getItem(PREFIX + this.head.id) === this.expected) {
        this.storage.removeItem(PREFIX + this.head.id);
        this.storage.removeItem(this.head.base);
      }
    } finally {
      // A failure cleaning an already removed head must not permanently poison
      // later edits. Any remaining old keys stay available for explicit recovery.
      this.head = null;
      this.latest = null;
      this.expected = null;
    }
  }
}
async function legacyIdentity(key: string, value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}\0${value}`)),
  );
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = [...bytes.slice(0, 16)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function listFallbacks(
  storage: Storage,
  context: FallbackContext,
): Promise<FallbackListing> {
  const drafts: FallbackCandidate[] = [],
    issues: string[] = [];
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (
      key &&
      (key.startsWith(PREFIX) ||
        key === 'marklyra-draft' ||
        key.startsWith('marklyra-draft:editor-'))
    )
      keys.push(key);
    if (keys.length > 256) {
      issues.push('本地恢复副本超过 256 项，请保留数据并检查');
      break;
    }
  }
  for (const key of keys.slice(0, 256)) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      if (key.startsWith(PREFIX)) {
        const head = readHead(raw);
        if (key !== PREFIX + head.id) throw new Error('本地恢复标识不一致');
        drafts.push({
          key,
          expected: raw,
          id: head.id,
          version: head.version,
          owner: head.owner,
          legacyLabel: null,
          base: head.base,
          updatedAt: head.updatedAt,
          active: context.activeOwners.includes(head.owner),
          content: materialize(storage, head),
        });
      } else {
        if (raw.length > MAX_CHARACTERS) throw new Error('旧本地草稿超过大小上限，原内容已保留');
        const legacyLabel = key === 'marklyra-draft' ? null : key.slice('marklyra-draft:'.length);
        drafts.push({
          key,
          expected: raw,
          id: await legacyIdentity(key, raw),
          version: 1,
          owner: null,
          legacyLabel,
          base: null,
          updatedAt: 0,
          active: !!legacyLabel && context.activeLabels.includes(legacyLabel),
          content: { text: raw, savedText: '', document: null, selection: null },
        });
      }
    } catch (error) {
      issues.push(`${key}：${String(error)}`);
    }
  }
  return { drafts, issues };
}
/** Call only after a native import receipt; a changed local generation survives. */
export function consumeFallback(storage: Storage, candidate: FallbackCandidate): boolean {
  if (storage.getItem(candidate.key) !== candidate.expected) return false;
  storage.removeItem(candidate.key);
  if (candidate.base) storage.removeItem(candidate.base);
  return true;
}
