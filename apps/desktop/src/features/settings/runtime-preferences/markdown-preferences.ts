import { marklyraMarkdownPreferences } from '@marklyra/editor-runtime';

export type MarkdownIndentSize = -1 | 0 | 2 | 3 | 4 | 5;
export interface MarkdownPreferenceValues {
  indentSize: MarkdownIndentSize;
  prettyIndent: boolean;
  headingStyle?: 0 | 1 | 2 | 3;
  ulStyle?: 0 | 1 | 2;
  olStyle?: 0 | 1;
}
export type MarkdownPreferenceChange = Partial<MarkdownPreferenceValues>;
export interface MarkdownPreferencesSnapshot extends MarkdownPreferenceValues {
  schemaVersion: 1;
  revision: number;
}

const keys = ['indentSize', 'prettyIndent', 'headingStyle', 'ulStyle', 'olStyle'] as const;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Markdown偏好必须为对象。');
  return value as Record<string, unknown>;
}
function indent(value: unknown): MarkdownIndentSize {
  if (value !== -1 && value !== 0 && value !== 2 && value !== 3 && value !== 4 && value !== 5)
    throw new Error('Markdown缩进值无效。');
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Markdown偏好版本无效。');
  return value;
}

export function markdownPreferenceChange(value: unknown): MarkdownPreferenceChange {
  const input = record(value),
    entries = Object.entries(input);
  if (!entries.length) throw new Error('Markdown偏好变更不能为空。');
  const result: MarkdownPreferenceChange = {};
  for (const [key, item] of entries) {
    if (key === 'indentSize') result.indentSize = indent(item);
    else if (key === 'prettyIndent' && typeof item === 'boolean') result.prettyIndent = item;
    else if (key === 'headingStyle' || key === 'ulStyle' || key === 'olStyle') {
      const checked = marklyraMarkdownPreferences({ [key]: item });
      Object.assign(result, { [key]: checked[key] });
    } else throw new Error('Markdown偏好字段或值无效。');
  }
  return result;
}

export function markdownPreferencesSnapshot(value: unknown): MarkdownPreferencesSnapshot {
  const input = record(value);
  const present = Object.keys(input);
  if (
    input.schemaVersion !== 1 ||
    !['schemaVersion', 'revision', 'indentSize', 'prettyIndent'].every((key) =>
      Object.hasOwn(input, key),
    ) ||
    !present.every((key) => ['schemaVersion', 'revision', ...keys].includes(key))
  )
    throw new Error('Markdown偏好响应损坏或版本不受支持。');
  if (typeof input.prettyIndent !== 'boolean') throw new Error('Markdown对齐缩进值无效。');
  return {
    schemaVersion: 1,
    revision: revision(input.revision),
    indentSize: indent(input.indentSize),
    prettyIndent: input.prettyIndent,
    ...markdownPreferenceChange(
      Object.fromEntries(
        keys.filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]]),
      ),
    ),
  };
}

export const markdownPreferenceKeys = [
  'indentSize',
  'prettyIndent',
  'heading_style',
  'ul_style',
  'ol_style',
] as const;
const styleKeys = {
  heading_style: 'headingStyle',
  ul_style: 'ulStyle',
  ol_style: 'olStyle',
} as const;
export function markdownPreferencePatch(key: string, value: unknown): MarkdownPreferenceChange {
  if (!isMarkdownPreferenceKey(key)) throw new Error('Markdown偏好字段无效。');
  const sdkKey = key === 'indentSize' || key === 'prettyIndent' ? key : styleKeys[key];
  return markdownPreferenceChange({ [sdkKey]: value });
}
export function isMarkdownPreferenceKey(
  key: string,
): key is (typeof markdownPreferenceKeys)[number] {
  return markdownPreferenceKeys.includes(key as (typeof markdownPreferenceKeys)[number]);
}
export function markdownPreferencesOptions(
  value: MarkdownPreferencesSnapshot,
): Record<string, unknown> {
  const snapshot = markdownPreferencesSnapshot(value);
  return {
    indentSize: snapshot.indentSize,
    prettyIndent: snapshot.prettyIndent,
    heading_style: snapshot.headingStyle ?? 0,
    ul_style: snapshot.ulStyle ?? 0,
    ol_style: snapshot.olStyle ?? 0,
    // Original getValue checks its camel-case prop before reading the raw key.
    headingStyle: snapshot.headingStyle ?? 0,
    ulStyle: snapshot.ulStyle ?? 0,
    olStyle: snapshot.olStyle ?? 0,
    marklyraMarkdownActions: true,
  };
}
