/** Missing preferences use the product default; an explicit opt-out is preserved. */
export function readAutoSavePreference(): boolean {
  try {
    return localStorage.getItem('marklyra-autosave') !== 'false';
  } catch {
    return true;
  }
}
