import type { MarkdownSerializationPolicy } from '../markdown-preferences.js';
import type { LegacyGlobals } from './legacy-types.js';

const keys = [
  'indentSize',
  'indentByTab',
  'prettyIndent',
  'headingStyle',
  'ulStyle',
  'olStyle',
] as const;

export function readMarkdownPolicy(runtime: LegacyGlobals): MarkdownSerializationPolicy {
  const options = runtime.File?.option;
  if (!options) throw new Error('Markdown serializer options are unavailable');
  const { indentSize, indentByTab, prettyIndent, headingStyle, ulStyle, olStyle } = options;
  if (
    (indentSize !== 2 && indentSize !== 3 && indentSize !== 4 && indentSize !== 5) ||
    typeof indentByTab !== 'boolean' ||
    typeof prettyIndent !== 'boolean' ||
    ![0, 1, 2, 3].includes(headingStyle as number) ||
    ![0, 1, 2].includes(ulStyle as number) ||
    ![0, 1].includes(olStyle as number)
  )
    throw new Error('Unsupported Markdown serializer policy');
  return {
    indentSize,
    indentByTab,
    prettyIndent,
    headingStyle,
    ulStyle,
    olStyle,
  } as MarkdownSerializationPolicy;
}

/** Synchronous descriptor transaction. The caller must invoke the returned
 * restoration before yielding when this is a counterfactual serialization. */
export function writeMarkdownPolicy(
  runtime: LegacyGlobals,
  policy: MarkdownSerializationPolicy,
): () => void {
  const options = runtime.File?.option;
  if (!options) throw new Error('Markdown serializer options are unavailable');
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(options, key)] as const);
  for (const [, descriptor] of saved)
    if (descriptor && (!('value' in descriptor) || !descriptor.writable))
      throw new Error('Markdown serializer policy must have writable data properties');
  const restore = () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(options, key, descriptor);
      else if (!Reflect.deleteProperty(options, key)) throw new Error(`Cannot restore ${key}`);
    }
  };
  try {
    for (const [key, descriptor] of saved)
      Object.defineProperty(
        options,
        key,
        descriptor
          ? { ...descriptor, value: policy[key] ?? 0 }
          : { value: policy[key] ?? 0, configurable: true, enumerable: true, writable: true },
      );
  } catch (error) {
    try {
      restore();
    } catch (rollback) {
      throw new AggregateError([error, rollback], 'Markdown policy update and rollback failed');
    }
    throw error;
  }
  return restore;
}
