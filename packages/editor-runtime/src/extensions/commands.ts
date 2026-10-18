import type { MarkLyraExtensionEditorCommand } from './contracts.js';

const simple = new Set([
  'undo',
  'redo',
  'insertTable',
  'codeBlock',
  'mathBlock',
  'horizontalRule',
  'indent',
  'outdent',
]);
const styles = new Set([
  'strong',
  'em',
  'del',
  'code',
  'underline',
  'highlight',
  'subscript',
  'superscript',
  'inline_math',
  'link',
  'image',
]);

export function extensionImageName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 255 ||
    /[\\/:]/.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new TypeError('Extension image name must be a basename, not a path');
  return value;
}

/** Copy validated primitive arguments before an asynchronous dispatch. No ABI escape hatch. */
export function extensionEditorCommand(value: unknown): MarkLyraExtensionEditorCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid extension editor command');
  const input = value as Record<string, unknown>;
  const type = input.type;
  let fields: string[];
  if (typeof type !== 'string') throw new TypeError('Invalid extension editor command');
  if (simple.has(type)) fields = ['type'];
  else if (type === 'insertText' && typeof input.text === 'string') fields = ['type', 'text'];
  else if (
    type === 'heading' &&
    typeof input.level === 'number' &&
    Number.isInteger(input.level) &&
    input.level >= 0 &&
    input.level <= 6
  )
    fields = ['type', 'level'];
  else if (
    type === 'list' &&
    typeof input.style === 'string' &&
    ['ul', 'ol', 'tasklist', 'blockquote'].includes(input.style)
  )
    fields = ['type', 'style'];
  else if (type === 'format' && typeof input.style === 'string' && styles.has(input.style))
    fields = ['type', 'style'];
  else throw new TypeError(`Unsupported extension editor command: ${type}`);
  if (Object.keys(input).some((key) => !fields.includes(key)))
    throw new TypeError('Unexpected extension editor command field');
  return Object.fromEntries(
    fields.map((field) => [field, input[field]]),
  ) as MarkLyraExtensionEditorCommand;
}
