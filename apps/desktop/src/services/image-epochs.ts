// Native document location generations, never grants derived from paths.
const epochs = new Map<string, number>();
export function recordImageEpoch(id: string, revision: number | undefined): void {
  if (revision === undefined || !Number.isSafeInteger(revision) || revision < 0) return;
  if ((epochs.get(id) ?? -1) > revision) return;
  epochs.delete(id);
  epochs.set(id, revision);
  if (epochs.size > 128) {
    const first = epochs.keys().next().value;
    if (first !== undefined) epochs.delete(first);
  }
}
export function imageEpoch(id: string): number | undefined {
  return epochs.get(id);
}
export function forgetImageEpoch(id: string): void {
  epochs.delete(id);
}
