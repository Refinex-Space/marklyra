import { useId, useRef } from 'react';
import { headerFooterVariables, type PdfExportPreferences } from '../preferences.js';
import { TextField } from './controls.js';

type Field = 'headerLeft' | 'header' | 'headerRight' | 'footerLeft' | 'footer' | 'footerRight';

const zones: readonly { field: Field; label: string; band: '页眉' | '页脚'; zone: string }[] = [
  { field: 'headerLeft', label: '页眉 · 左', band: '页眉', zone: '左' },
  { field: 'header', label: '页眉 · 中', band: '页眉', zone: '中' },
  { field: 'headerRight', label: '页眉 · 右', band: '页眉', zone: '右' },
  { field: 'footerLeft', label: '页脚 · 左', band: '页脚', zone: '左' },
  { field: 'footer', label: '页脚 · 中', band: '页脚', zone: '中' },
  { field: 'footerRight', label: '页脚 · 右', band: '页脚', zone: '右' },
];

/** Types a value into an input the way a person would, so the field saves it like any edit. */
function insertAtCaret(input: HTMLInputElement, token: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const next = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = start + token.length;
  input.setSelectionRange(caret, caret);
}

/** Header and footer text in three zones, with the variables an export resolves. */
export function HeaderFooterEditor({
  pdf,
  onChange,
}: {
  pdf: PdfExportPreferences;
  onChange: (field: Field, value: string) => void;
}) {
  const base = useId();
  const inputs = useRef(new Map<Field, HTMLInputElement>());
  const last = useRef<Field>('footer');
  const insert = (token: string) => {
    const input = inputs.current.get(last.current);
    if (!input) return;
    input.focus();
    insertAtCaret(input, token);
  };
  return (
    <div className="es-bands">
      <fieldset className="es-variables" aria-label="插入变量">
        <span>插入变量</span>
        {headerFooterVariables.map((variable) => (
          <button
            key={variable.token}
            type="button"
            className="es-chip"
            title={`插入 ${variable.token}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(variable.token)}
          >
            {variable.label}
          </button>
        ))}
      </fieldset>
      {(['页眉', '页脚'] as const).map((band) => (
        <fieldset className="es-band" aria-label={band} key={band}>
          <h4>{band}</h4>
          <div className="es-zones">
            {zones
              .filter((entry) => entry.band === band)
              .map((entry) => (
                <label key={entry.field} htmlFor={`${base}-${entry.field}`}>
                  <span>{entry.zone}</span>
                  <TextField
                    id={`${base}-${entry.field}`}
                    label={entry.label}
                    value={pdf[entry.field] ?? ''}
                    maxLength={200}
                    placeholder={entry.zone === '中' ? '无' : ''}
                    inputRef={(element) => {
                      if (element) inputs.current.set(entry.field, element);
                      else inputs.current.delete(entry.field);
                    }}
                    onFocus={() => {
                      last.current = entry.field;
                    }}
                    onCommit={(value) => onChange(entry.field, value)}
                  />
                </label>
              ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
