const privateSchemes = new Set(['javascript', 'vbscript', 'blob', 'marklyra', 'recovered']);

/** Preserve URI data while excluding active code and current private capabilities.
 * Navigation and image access remain subject to their separate host boundaries. */
export function clipboardMarkupAddressAllowed(value: string, image: boolean): boolean {
  const address = [...value]
    .filter(
      (character) =>
        character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127 && !/\s/u.test(character),
    )
    .join('');
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(address)?.[1]?.toLowerCase();
  return !scheme || (!privateSchemes.has(scheme) && (image || scheme !== 'file'));
}
