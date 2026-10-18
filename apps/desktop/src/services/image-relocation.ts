/** Lexical eligibility only. Native retained image capabilities authorize every read. */
export function relocationImageReferences(
  previousPath: string,
  nextPath: string,
  storageFolder: string,
  referenceRoot: string,
  references: readonly string[],
): string[] {
  if (
    !storageFolder ||
    /^(?:upload|ipic|textbundle)$/i.test(storageFolder) ||
    /^(?:https?:|upload:|textbundle:)/i.test(storageFolder)
  )
    return [];
  const file = (path: string) => {
    const url = new URL('file:///');
    const normalized = path.replaceAll('\\', '/');
    url.pathname = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return url;
  };
  const stem = (path: string) => {
    const name = path.replaceAll('\\', '/').split('/').at(-1) ?? '';
    const extension = name.lastIndexOf('.');
    return extension > 0 ? name.slice(0, extension) : name;
  };
  const oldFile = file(previousPath);
  const newFile = file(nextPath);
  const directory = (url: URL) => new URL('.', url);
  const target = (url: URL, name: string) =>
    new URL(`${storageFolder.replaceAll('${filename}', name).replace(/\/+$/, '')}/`, url);
  try {
    const oldStorage = target(oldFile, stem(previousPath));
    const newStorage = target(newFile, stem(nextPath));
    if (
      oldStorage.href === newStorage.href ||
      new URL('..', oldStorage).href !== directory(oldFile).href
    )
      return [];
    return references.filter((reference) => {
      if (/^(?:https?:|data:)/i.test(reference)) return false;
      const root = referenceRoot
        ? new URL(`${referenceRoot.replace(/\/+$/, '')}/`, oldFile)
        : oldFile;
      const resolved = new URL(reference, root);
      return resolved.protocol === 'file:' && resolved.href.startsWith(oldStorage.href);
    });
  } catch {
    return [];
  }
}
