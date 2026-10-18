/** Keep the original select and its save handler; only replace the native popup. */
export function setupBoundedSelect(selector: string) {
  let owner: HTMLSelectElement | null = null;
  let popup: HTMLUListElement | null = null;
  let active = 0;
  let prefix = '';
  let typedAt = 0;
  let serial = 0;
  const target = (element: EventTarget | null) =>
    element instanceof HTMLSelectElement && element.matches(selector) ? element : null;
  const close = () => {
    owner?.setAttribute('aria-expanded', 'false');
    owner?.removeAttribute('aria-controls');
    owner?.removeAttribute('aria-activedescendant');
    popup?.remove();
    owner = null;
    popup = null;
    prefix = '';
  };
  const highlight = (index: number) => {
    if (!owner || !popup) return;
    active = index;
    for (const [position, item] of [...popup.children].entries())
      item.classList.toggle('active', position === active);
    const item = popup.children[active];
    if (!(item instanceof HTMLElement)) return;
    owner.setAttribute('aria-activedescendant', item.id);
    if (item.offsetTop < popup.scrollTop) popup.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > popup.scrollTop + popup.clientHeight)
      popup.scrollTop = item.offsetTop + item.offsetHeight - popup.clientHeight;
  };
  const choose = (index: number) => {
    const select = owner;
    const option = select?.options[index];
    if (!select || select.disabled || !option || option.disabled) return;
    close();
    select.focus({ preventScroll: true });
    if (select.value === option.value) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const open = (select: HTMLSelectElement) => {
    if (select.disabled || !select.options.length) return;
    close();
    owner = select;
    popup = document.createElement('ul');
    popup.className = 'dropdown-menu settings-select-popup shown';
    popup.id = `settings-select-popup-${++serial}`;
    popup.setAttribute('role', 'listbox');
    popup.setAttribute(
      'aria-label',
      select.closest('tr')?.cells[0]?.textContent?.trim() || '选择选项',
    );
    for (const [index, option] of [...select.options].entries()) {
      const item = document.createElement('li');
      item.id = `${popup.id}-${index}`;
      item.textContent = option.label;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.setAttribute('aria-disabled', String(option.disabled));
      item.addEventListener('pointermove', () => {
        if (!option.disabled) highlight(index);
      });
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => choose(index));
      popup.append(item);
    }
    document.body.append(popup);
    const box = select.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - 12;
    const above = box.top - 12;
    const upward = below < 252 && above > below;
    const height = Math.min(252, Math.max(0, upward ? above : below));
    popup.style.width = `${Math.min(box.width, window.innerWidth - 16)}px`;
    popup.style.maxHeight = `${height}px`;
    popup.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8))}px`;
    popup.style.top = `${upward ? box.top - popup.offsetHeight - 4 : box.bottom + 4}px`;
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-controls', popup.id);
    highlight(Math.max(0, select.selectedIndex));
  };
  document.addEventListener(
    'mousedown',
    (event) => {
      const select = target(event.target);
      if (select && !select.disabled) {
        // Prevent the system menu; click below opens the bounded page menu.
        event.preventDefault();
        select.focus({ preventScroll: true });
      } else if (!(event.target instanceof Node && popup?.contains(event.target))) close();
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      const select = target(event.target);
      if (!select || select.disabled) return;
      event.preventDefault();
      if (owner === select) close();
      else open(select);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      const select = target(event.target);
      if (!select || select.disabled || event.isComposing || event.metaKey || event.ctrlKey) return;
      if (event.key === 'Tab' || event.key === 'Escape') {
        if (event.key === 'Escape' && owner) event.preventDefault();
        close();
        return;
      }
      const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key);
      const character = event.key.length === 1 && !event.altKey;
      if (!navigation && !character) return;
      event.preventDefault();
      event.stopPropagation();
      if (owner !== select) {
        open(select);
        if (navigation) return;
      } else if (event.key === 'Enter' || event.key === ' ') {
        choose(active);
        return;
      }
      const available = [...select.options].flatMap((option, index) =>
        option.disabled ? [] : [index],
      );
      if (!available.length) return;
      if (event.key === 'Home') highlight(available[0] ?? 0);
      else if (event.key === 'End') highlight(available.at(-1) ?? 0);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        highlight(
          available[
            (available.indexOf(active) + direction + available.length) % available.length
          ] ?? 0,
        );
      } else if (character) {
        prefix =
          Date.now() - typedAt < 700 ? prefix + event.key.toLowerCase() : event.key.toLowerCase();
        typedAt = Date.now();
        const match = available.find((index) =>
          select.options[index]?.label.toLowerCase().startsWith(prefix),
        );
        if (match !== undefined) highlight(match);
      }
    },
    true,
  );
  document.addEventListener('focusin', (event) => {
    if (owner && event.target !== owner) close();
  });
  document.addEventListener(
    'scroll',
    (event) => {
      if (!(event.target instanceof Node && popup?.contains(event.target))) close();
    },
    true,
  );
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  return () => {
    if (owner && (!owner.isConnected || owner.disabled || !owner.getClientRects().length)) close();
  };
}
