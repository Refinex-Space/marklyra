export type NativePage = 'ai' | 'daily' | 'export' | 'git' | 'sponsorship';

/** The sidebar's fixed index of its 导出 category. */
const EXPORT_INDEX = '4';

/**
 * Navigation only. Additional settings pages are drawn by the trusted host on top of this isolated page:
 * 日程、Git 同步、智能体、赞助 (extra sidebar entries added here) and 导出 (the entry, whose own panel is
 * never shown). The isolated page never receives agent IPC, credentials or export settings.
 */
export function setupNativePages(
  select: (page: NativePage | null) => void,
  initiallySelected: NativePage | null,
) {
  let page = initiallySelected;
  const exportItem = () =>
    document.querySelector<HTMLElement>(`.nav-group-item[data-index="${EXPORT_INDEX}"]`);
  const syncSelection = () => {
    const native = exportItem();
    for (const item of document.querySelectorAll<HTMLElement>('.nav-group-item')) {
      const selected = item.hasAttribute('data-ai-settings-navigation')
        ? page === 'ai'
        : item.hasAttribute('data-daily-settings-navigation')
          ? page === 'daily'
          : item.hasAttribute('data-git-settings-navigation')
            ? page === 'git'
            : item.hasAttribute('data-sponsorship-navigation')
              ? page === 'sponsorship'
              : page === null
                ? item.classList.contains('active')
                : page === 'export' && item === native;
      item.setAttribute('aria-current', selected ? 'page' : 'false');
    }
  };
  const set = (value: NativePage | null) => {
    page = value;
    if (value) document.documentElement.dataset.nativePage = value;
    else delete document.documentElement.dataset.nativePage;
    const button = document.querySelector<HTMLElement>('[data-ai-settings-navigation]');
    button?.classList.toggle('active', value === 'ai');
    document
      .querySelector('[data-daily-settings-navigation]')
      ?.classList.toggle('active', value === 'daily');
    document
      .querySelector('[data-git-settings-navigation]')
      ?.classList.toggle('active', value === 'git');
    document
      .querySelector('[data-sponsorship-navigation]')
      ?.classList.toggle('active', value === 'sponsorship');
    syncSelection();
    select(value);
  };
  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-ai-settings-navigation]')) {
        event.preventDefault();
        set('ai');
      } else if (event.target.closest('[data-daily-settings-navigation]')) {
        event.preventDefault();
        set('daily');
      } else if (event.target.closest('[data-git-settings-navigation]')) {
        event.preventDefault();
        set('git');
      } else if (event.target.closest('[data-sponsorship-navigation]')) {
        event.preventDefault();
        set('sponsorship');
      } else if (event.target.closest(`.nav-group-item[data-index="${EXPORT_INDEX}"]`)) {
        // The click still runs, so the panel keeps tracking the selection.
        set('export');
      } else if (event.target.closest('.nav-group-item,.settings-back')) set(null);
    },
    true,
  );
  document.addEventListener('input', (event) => {
    if (event.target instanceof Element && event.target.matches('.search-input')) set(null);
  });
  const style = document.createElement('style');
  // The export panel is replaced by the host page, including in search results.
  // Standalone legacy preferences do not use the shared page stylesheet.
  style.textContent =
    '[data-ai-settings-navigation],[data-daily-settings-navigation],[data-git-settings-navigation],[data-sponsorship-navigation]{appearance:none;background:transparent;width:100%;text-align:left;cursor:pointer;border:0;box-shadow:none;font:inherit;}' +
    `.pane > .content[data-index="${EXPORT_INDEX}"]{display:none!important}` +
    'html:not([data-settings-page])[data-native-page="ai"] .nav-group-item.active:not([data-ai-settings-navigation]),html:not([data-settings-page])[data-native-page="daily"] .nav-group-item.active:not([data-daily-settings-navigation]),html:not([data-settings-page])[data-native-page="git"] .nav-group-item.active:not([data-git-settings-navigation]),html:not([data-settings-page])[data-native-page="sponsorship"] .nav-group-item.active:not([data-sponsorship-navigation]){background:transparent!important;color:inherit!important;font-weight:400}';
  document.head.append(style);
  return () => {
    const sidebar = document.querySelector('.pane-sm.sidebar');
    if (!sidebar) return;
    syncSelection();
    let changed = false;
    if (!sidebar.querySelector('[data-daily-settings-navigation]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-group-item';
      button.dataset.dailySettingsNavigation = 'true';
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.style.fill = 'none';
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4');
      svg.append(path);
      icon.append(svg);
      button.append(icon, document.createTextNode('日程'));
      button.setAttribute('aria-label', '日程');
      sidebar.append(button);
      changed = true;
    }
    if (!sidebar.querySelector('[data-git-settings-navigation]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-group-item';
      button.dataset.gitSettingsNavigation = 'true';
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.style.fill = 'none';
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('stroke-linecap', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M6 3v12 M18 9a3 3 0 1 0 0-.01 M6 21a3 3 0 1 0 0-.01 M18 12c0 4-6 3-11 6',
      );
      svg.append(path);
      icon.append(svg);
      button.append(icon, document.createTextNode('Git 同步'));
      button.setAttribute('aria-label', 'Git 同步');
      // Keep the documented order: 日程, Git 同步, then 智能体 and 赞助.
      const after = sidebar.querySelector('[data-daily-settings-navigation]');
      if (after) after.after(button);
      else sidebar.append(button);
      changed = true;
    }
    if (!sidebar.querySelector('[data-ai-settings-navigation]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-group-item';
      button.dataset.aiSettingsNavigation = 'true';
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.style.fill = 'none';
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z M20 2v4 M18 4h4',
      );
      svg.append(path);
      icon.append(svg);
      button.append(icon, document.createTextNode('智能体'));
      button.setAttribute('aria-label', '智能体');
      sidebar.append(button);
      changed = true;
    }
    if (!sidebar.querySelector('[data-sponsorship-navigation]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-group-item';
      button.dataset.sponsorshipNavigation = 'true';
      button.setAttribute('aria-label', '赞助');
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.style.fill = 'none';
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M12 20.5C5 15.5 3 12 3 8.8A4.8 4.8 0 0 1 12 6.4 4.8 4.8 0 0 1 21 8.8c0 3.2-2 6.7-9 11.7z',
      );
      svg.append(path);
      icon.append(svg);
      button.append(icon, document.createTextNode('赞助'));
      sidebar.append(button);
      changed = true;
    }
    if (changed) set(page);
  };
}
