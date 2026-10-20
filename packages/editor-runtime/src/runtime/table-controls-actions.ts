import type { ContextAction, ContextMenuItem } from '../context-menu/contracts.js';

export type TableAxis = 'row' | 'column';
export type TableControlAction =
  | ContextAction
  | 'table.headingRow'
  | 'table.headingColumn'
  | 'table.alignLeft'
  | 'table.alignCenter'
  | 'table.alignRight';
export interface TableControlItem {
  type: 'item';
  actionId: TableControlAction;
  label: string;
  enabled: boolean;
  group: 'move' | 'insert' | 'heading' | 'alignment' | 'delete';
  checked?: boolean;
}
export interface TableControlContext {
  items: readonly TableControlItem[];
  current(): boolean;
  run(action: TableControlAction): void;
}

// Only existing Markdown-preserving structural operations are offered by the handles.
const actions: Record<TableAxis, readonly ContextAction[]> = {
  row: [
    'table.moveRowUp',
    'table.moveRowDown',
    'table.insertRowBefore',
    'table.insertRowAfter',
    'table.deleteRow',
  ],
  column: [
    'table.moveColumnLeft',
    'table.moveColumnRight',
    'table.insertColumnBefore',
    'table.insertColumnAfter',
    'table.deleteColumn',
  ],
};

export function tableControlItems(
  axis: TableAxis,
  items: readonly ContextMenuItem[],
  heading: { enabled: boolean; checked: boolean },
  alignment?: 'left' | 'center' | 'right' | null,
): TableControlItem[] {
  const table = items.find((item) => item.type === 'submenu' && item.label === '表格');
  if (table?.type !== 'submenu') return [];
  const result: TableControlItem[] = actions[axis].flatMap((id) => {
    const item = table.items.find((item) => item.type === 'item' && item.actionId === id);
    return item?.type === 'item'
      ? [
          {
            ...item,
            group: id.includes('move') ? 'move' : id.includes('insert') ? 'insert' : 'delete',
          },
        ]
      : [];
  });
  const format: TableControlItem[] = [
    {
      type: 'item',
      actionId: axis === 'row' ? 'table.headingRow' : 'table.headingColumn',
      label: axis === 'row' ? '设为标题行' : '设为标题列',
      enabled: heading.enabled,
      checked: heading.checked,
      group: 'heading',
    },
  ];
  if (axis === 'column') {
    for (const [value, actionId, label] of [
      ['left', 'table.alignLeft', '左对齐'],
      ['center', 'table.alignCenter', '居中对齐'],
      ['right', 'table.alignRight', '右对齐'],
    ] as const)
      format.push({
        type: 'item',
        actionId,
        label,
        enabled: true,
        checked: alignment === value,
        group: 'alignment',
      });
  }
  result.splice(4, 0, ...format);
  const remove = table.items.find(
    (item) => item.type === 'item' && item.actionId === 'table.delete',
  );
  if (remove?.type === 'item') result.push({ ...remove, group: 'delete' });
  return result;
}
