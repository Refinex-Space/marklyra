/** Markdown serialization settings are separate from display/input preferences:
 * applying them requires rebasing source coordinates without a content edit. */
export interface MarkLyraMarkdownPreferences {
  indentSize: -1 | 0 | 2 | 3 | 4 | 5;
  prettyIndent: boolean;
  headingStyle?: 0 | 1 | 2 | 3;
  ulStyle?: 0 | 1 | 2;
  olStyle?: 0 | 1;
}

export type ResolvedMarkLyraMarkdownPreferences = Required<MarkLyraMarkdownPreferences>;

export interface MarkdownSerializationPolicy {
  readonly indentSize: 2 | 3 | 4 | 5;
  readonly indentByTab: boolean;
  readonly prettyIndent: boolean;
  readonly headingStyle?: 0 | 1 | 2 | 3;
  readonly ulStyle?: 0 | 1 | 2;
  readonly olStyle?: 0 | 1;
}

export const defaultMarkLyraMarkdownPreferences: Readonly<ResolvedMarkLyraMarkdownPreferences> =
  Object.freeze({ indentSize: 2, prettyIndent: false, headingStyle: 0, ulStyle: 0, olStyle: 0 });

export function marklyraMarkdownPreferences(
  value: unknown,
  base: Readonly<MarkLyraMarkdownPreferences> = defaultMarkLyraMarkdownPreferences,
): ResolvedMarkLyraMarkdownPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Markdown preferences must be an object');
  const result = { ...defaultMarkLyraMarkdownPreferences, ...base };
  for (const [key, input] of Object.entries(value)) {
    if (key === 'indentSize') {
      if (input !== -1 && input !== 0 && input !== 2 && input !== 3 && input !== 4 && input !== 5)
        throw new TypeError('indentSize must be Auto (0), 2, 3, 4, 5 or Tab (-1)');
      result.indentSize = input;
    } else if (key === 'prettyIndent') {
      if (typeof input !== 'boolean') throw new TypeError('prettyIndent must be boolean');
      result.prettyIndent = input;
    } else if (key === 'headingStyle') {
      if (input !== 0 && input !== 1 && input !== 2 && input !== 3)
        throw new TypeError('headingStyle must be 0, 1, 2 or 3');
      result.headingStyle = input;
    } else if (key === 'ulStyle') {
      if (input !== 0 && input !== 1 && input !== 2)
        throw new TypeError('ulStyle must be 0, 1 or 2');
      result.ulStyle = input;
    } else if (key === 'olStyle') {
      if (input !== 0 && input !== 1) throw new TypeError('olStyle must be 0 or 1');
      result.olStyle = input;
    } else throw new TypeError(`Unknown Markdown preference: ${key}`);
  }
  return result;
}

export function markdownSerializationPolicy(
  preferences: Readonly<MarkLyraMarkdownPreferences>,
): MarkdownSerializationPolicy {
  return {
    indentSize:
      preferences.indentSize === -1 || preferences.indentSize === 0 ? 2 : preferences.indentSize,
    indentByTab: preferences.indentSize === -1,
    prettyIndent: preferences.prettyIndent,
    headingStyle: preferences.headingStyle ?? 0,
    ulStyle: preferences.ulStyle ?? 0,
    olStyle: preferences.olStyle ?? 0,
  };
}

export function sameMarkdownPolicy(
  left: MarkdownSerializationPolicy,
  right: MarkdownSerializationPolicy,
): boolean {
  return (
    left.indentSize === right.indentSize &&
    left.indentByTab === right.indentByTab &&
    left.prettyIndent === right.prettyIndent &&
    (left.headingStyle ?? 0) === (right.headingStyle ?? 0) &&
    (left.ulStyle ?? 0) === (right.ulStyle ?? 0) &&
    (left.olStyle ?? 0) === (right.olStyle ?? 0)
  );
}
