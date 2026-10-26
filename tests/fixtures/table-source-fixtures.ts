/** Authored source preservation vectors. Container prefixes are explicit input,
 * and engine controls for quote/list/header semantics are indexed in . */
export const tableContainers = [
  'root',
  'quote',
  'list',
  'quote-list',
  'ordered-list',
  'ordered-quote-list',
] as const;
export type TableContainer = (typeof tableContainers)[number];
export function tableDocument(table: string, container: TableContainer): string {
  const prefixes: Record<TableContainer, string> = {
    root: '',
    quote: '> ',
    list: '   ',
    'quote-list': '>    ',
    'ordered-list': '     ',
    'ordered-quote-list': '>      ',
  };
  const leads: Record<TableContainer, string> = {
    root: '',
    quote: '',
    list: '- Parent\r\n\r\n',
    'quote-list': '> - Parent\r\n>\r\n',
    'ordered-list': '009. Parent\r\n\r\n',
    'ordered-quote-list': '> 009. Parent\r\n>\r\n',
  };
  return (
    '\ufeffPreface\r\n\r\n' +
    leads[container] +
    table
      .split(/(?<=\n)/u)
      .map((line) => prefixes[container] + line)
      .join('') +
    '\r\n\r\n```text\r\n  keep CODE  \n```\r\n\r\nTail  \r\n'
  );
}
export const repeatedTable = '| H1 | H2 |\r\n| :--- | ---: |\n| same | same |\n| same | same |';
export const tableRowFixtures = [
  {
    id: 'before-first-repeated-body',
    label: '在上方插入行',
    selector: '#write tbody tr:first-child td:first-child',
    expected: '| H1 | H2 |\r\n| :--- | ---: |\n|  |  |\n| same | same |\n| same | same |',
    kind: 'insert',
    at: 1,
  },
  {
    id: 'after-first-repeated-body',
    label: '在下方插入行',
    selector: '#write tbody tr:first-child td:first-child',
    expected: '| H1 | H2 |\r\n| :--- | ---: |\n| same | same |\n|  |  |\r\n| same | same |',
    kind: 'insert',
    at: 2,
  },
  {
    id: 'delete-first-repeated-body',
    label: '删除行',
    selector: '#write tbody tr:first-child td:first-child',
    expected: '| H1 | H2 |\r\n| :--- | ---: |\n| same | same |',
    kind: 'delete',
    at: 1,
  },
  {
    id: 'delete-last-repeated-body',
    label: '删除行',
    selector: '#write tbody tr:last-child td:first-child',
    expected: '| H1 | H2 |\r\n| :--- | ---: |\n| same | same |',
    kind: 'delete',
    at: 2,
  },
] as const;
