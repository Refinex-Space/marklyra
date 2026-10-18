/** Empty native selection text need not force a rendered-text layout. Do not use
 * isCollapsed: input/textarea ranges report true in Chromium and WebKit while
 * toString() returns their selected value. Their native type is still Range. */
export function readSelectionText(selection: Selection | null): string {
  if (!selection) return '';
  const type = selection.type;
  return type === 'Caret' || type === 'None' ? '' : selection.toString();
}
