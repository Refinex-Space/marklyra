export interface SavePageControls {
  state: () => Record<string, unknown>;
  save: (key: 'save_file_on_switch' | 'enableAutoSave', enabled: boolean) => void;
}

export function renderSavePreferences(pane: Element, controls: SavePageControls) {
  const state = controls.state();
  if (state.marklyraFileActions !== true) return;
  const input = pane.querySelector<HTMLInputElement>(
    '[data-marklyra-preference="save_file_on_switch"]',
  );
  const row = input?.closest<HTMLElement>('.checkbox.row');
  const content = row?.parentElement;
  const label = row?.querySelector('label');
  if (!input || !row || !content || !label) return;
  row.classList.add('settings-save-switch');
  input.setAttribute('aria-label', '切换文件时自动保存');
  for (const node of Array.from(label.childNodes)) {
    if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent?.trim() &&
      node.textContent !== '切换文件时自动保存'
    )
      node.textContent = '切换文件时自动保存';
  }
  if (!label.querySelector('.settings-save-description')) {
    const description = document.createElement('small');
    description.className = 'settings-save-description';
    description.textContent =
      '开启后，切换前自动保存已命名文稿；关闭后，有未保存修改时会询问保存、放弃修改或取消。';
    label.append(description);
  }
  // The legacy Windows control is replaced by the same explicitly labelled row on both platforms.
  for (const old of pane.querySelectorAll('[data-marklyra-preference="enableAutoSave"]')) {
    if (!old.hasAttribute('data-marklyra-background-save'))
      old.closest('.checkbox.row')?.classList.add('settings-original-background-save');
  }
  let background = content.querySelector<HTMLInputElement>('[data-marklyra-background-save]');
  if (!background) {
    const backgroundRow = document.createElement('div');
    backgroundRow.className = 'checkbox row settings-background-save';
    const backgroundLabel = document.createElement('label');
    background = document.createElement('input');
    background.type = 'checkbox';
    background.dataset.marklyraBackgroundSave = 'true';
    background.setAttribute('aria-label', '编辑时自动保存');
    background.addEventListener('change', (event) => {
      controls.save('enableAutoSave', (event.currentTarget as HTMLInputElement).checked);
    });
    const description = document.createElement('small');
    description.className = 'settings-save-description';
    description.textContent =
      '停止输入约 2 秒后自动保存已命名文稿；未命名文稿需先手动选择保存位置。';
    backgroundLabel.append(background, document.createTextNode('编辑时自动保存'), description);
    backgroundRow.append(backgroundLabel);
    content.append(backgroundRow);
    const shortcut = document.createElement('p');
    shortcut.className = 'settings-save-shortcut';
    const keys =
      new URL(location.href).searchParams.get('hostOs') === 'win' ? 'Ctrl + S' : '⌘S（Cmd + S）';
    shortcut.textContent = `随时可按 ${keys} 手动保存。未保存的修改会在切换、关闭前受到保护。`;
    content.append(shortcut);
  }
  background.checked = state.enableAutoSave === true;
}
