export interface TreePageControls {
  state: () => Record<string, unknown>;
  treeCount: (enabled: boolean) => void;
}

/**
 * The file tree's settings appear as a card on the 文件 page, beside the existing groups.
 * Controls and their save handlers stay in their React-owned parents.
 */
export function renderTreePreferences(pane: Element, controls: TreePageControls) {
  const state = controls.state();
  if (state.marklyraFileActions !== true) return;
  const content = pane.querySelector<HTMLElement>('.settings-file-content');
  if (!content) return;
  let input = content.querySelector<HTMLInputElement>('[data-marklyra-directory-count]');
  if (!input) {
    const group = document.createElement('div');
    group.className =
      'input-group settings-card-part settings-card-start settings-card-end settings-labelled-rows settings-tree-group';
    group.dataset.sectionTitle = '目录树';
    // After 文档与记录 (order 20 and 30) and before 拖放行为 (order 40).
    group.style.order = '35';
    const body = document.createElement('div');
    body.className = 'input-group-content';
    const row = document.createElement('div');
    row.className = 'checkbox row settings-tree-count';
    const label = document.createElement('label');
    input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.marklyraDirectoryCount = 'true';
    input.setAttribute('aria-label', '显示目录文档数量');
    input.addEventListener('change', (event) => {
      controls.treeCount((event.currentTarget as HTMLInputElement).checked);
    });
    const description = document.createElement('small');
    description.className = 'settings-save-description';
    description.textContent =
      '在文件树中，每个文件夹右侧显示其包含的文档数量（含子文件夹）；没有文档时不显示。';
    label.append(input, document.createTextNode('显示目录文档数量'), description);
    row.append(label);
    body.append(row);
    group.append(body);
    content.append(group);
  }
  // Enabled unless the confirmed setting says otherwise.
  input.checked = state.showDirectoryDocumentCount !== false;
}
