import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { StatisticsUnit } from '../settings/preferences.js';
import './document-statistics.css';

const order: readonly StatisticsUnit[] = ['readingMinutes', 'lines', 'words', 'characters'];
const names: Record<StatisticsUnit, string> = {
  readingMinutes: '分钟',
  lines: '行',
  words: '词',
  characters: '字符',
};

export interface DocumentStatisticsValue {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
}

/**
 * The document's word count, in the lower right corner of the document card. One press opens a
 * small menu above it to choose the unit; the choice is the same one the native menu offers.
 */
export function DocumentStatistics(props: {
  statistics: DocumentStatisticsValue | null;
  unit: StatisticsUnit;
  onUnit: (unit: StatisticsUnit) => void;
}) {
  const { statistics, unit, onUnit } = props;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const values = statistics ?? { words: 0, characters: 0, lines: 0, readingMinutes: 0 };
  const label = `${values[unit].toLocaleString()} ${names[unit]}`;

  useEffect(() => {
    if (!open) return;
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menu.current?.contains(event.target) || button.current?.contains(event.target)) return;
      setOpen(false);
    };
    const blur = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('blur', blur);
    };
  }, [open]);

  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="document-statistics">
      <button
        type="button"
        ref={button}
        className="document-statistics-button"
        aria-label={`字数统计：${label}`}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div
          className="document-statistics-menu"
          role="menu"
          aria-label="字数统计"
          ref={menu}
          onKeyDown={keys}
        >
          {order.map((entry) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={entry === unit}
              key={entry}
              onClick={() => {
                setOpen(false);
                onUnit(entry);
                button.current?.focus();
              }}
            >
              <span className="document-statistics-check" aria-hidden="true">
                {entry === unit && <Icon name="check" />}
              </span>
              {`${values[entry].toLocaleString()} ${names[entry]}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
