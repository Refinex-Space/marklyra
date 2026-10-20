/** The file name typed into the title popover. It is a name, never a path or a capability. */

/** Same Markdown family the file tree and links recognise; anything else gets the old extension. */
const MARKDOWN_EXTENSION =
  /\.(md|markdown|mdx|mkd|mdown|mdtext|mdtxt|mdwn|mmd|qmd|rmd|rmarkdown|txt|text|apib)$/i;
const WINDOWS_RESERVED = /[:*?"<>|]/;
const MAX_NAME_LENGTH = 255;

export type NameCheck = { name: string } | { error: string };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

/** The part to pre-select: everything before the final extension, so typing replaces the stem. */
export function stemRange(name: string): [number, number] {
  return [0, extensionOf(name) ? name.lastIndexOf('.') : name.length];
}

/**
 * Validate what the person typed against the current file name. Only cheap, certain rules live
 * here; the host still decides about collisions and platform-specific names.
 */
export function checkFileName(input: string, current: string, windows: boolean): NameCheck {
  const typed = input.trim();
  if (!typed) return { error: '名称不能为空' };
  for (const character of typed) {
    if (character.charCodeAt(0) <= 31) return { error: '名称不能包含控制字符' };
  }
  if (typed.includes('/') || typed.includes('\\')) return { error: '名称不能包含 / 或 \\' };
  if (windows && WINDOWS_RESERVED.test(typed)) return { error: '名称不能包含 : * ? " < > |' };
  if (windows && typed.endsWith('.')) return { error: '名称不能以 . 结尾' };
  if (typed === '.' || typed === '..') return { error: '名称无效' };
  const name = MARKDOWN_EXTENSION.test(typed) ? typed : `${typed}${extensionOf(current) || '.md'}`;
  if ([...name].length > MAX_NAME_LENGTH) return { error: '名称过长' };
  return { name };
}
