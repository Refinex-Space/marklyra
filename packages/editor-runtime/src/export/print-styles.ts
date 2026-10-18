/** Layout of a disposable print artifact. Never applied to the editor DOM. */
export const printArtifactStyles = `@media print {
  html, body { height: auto; overflow: visible; }
  body.typora-export { padding: 0; }
  #write { max-width: none; width: auto; padding: 0; overflow: visible; }
  #write .md-fences { break-inside: auto; page-break-inside: auto; white-space: pre-wrap; overflow: visible; overflow-wrap: anywhere; }
  #write .md-fences pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  #write table { break-inside: auto; page-break-inside: auto; }
  #write thead { display: table-header-group; }
  #write tr { break-inside: avoid; }
  #write img, #write svg { max-width: 100%; }
  #write .md-math-block, #write svg { break-inside: avoid; }
}`;
