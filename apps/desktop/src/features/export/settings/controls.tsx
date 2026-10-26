import {
  type ChangeEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

export function Card({
  title,
  description,
  children,
  actions,
}: {
  title?: string | undefined;
  description?: ReactNode | undefined;
  children: ReactNode;
  actions?: ReactNode | undefined;
}) {
  const heading = useId();
  return (
    <section className="es-card" aria-labelledby={title ? heading : undefined}>
      {(title || actions) && (
        <header className="es-card-head">
          {title && <h3 id={heading}>{title}</h3>}
          {actions && <div className="es-card-actions">{actions}</div>}
        </header>
      )}
      {description && <p className="es-card-note">{description}</p>}
      <div className="es-card-body">{children}</div>
    </section>
  );
}

/** A label on the left, its control on the right; `stacked` puts the control below the label. */
export function Row({
  label,
  hint,
  htmlFor,
  children,
  stacked,
}: {
  label: ReactNode;
  hint?: ReactNode | undefined;
  htmlFor?: string | undefined;
  children: ReactNode;
  stacked?: boolean | undefined;
}) {
  return (
    <div className={`es-row${stacked ? ' es-row-stacked' : ''}`}>
      <div className="es-row-label">
        <label htmlFor={htmlFor}>{label}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="es-row-control">{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
  id?: string | undefined;
}) {
  return (
    <label className="es-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  id,
}: {
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean | undefined;
  id?: string | undefined;
}) {
  return (
    <span className="es-select">
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean | undefined;
}) {
  const name = useId();
  return (
    <div className="es-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className={value === option.value ? 'checked' : undefined}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  kind,
  label,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
  kind?: 'primary' | 'danger' | undefined;
  label?: string | undefined;
  type?: 'button' | 'submit' | undefined;
}) {
  return (
    <button
      type={type}
      className={`es-button${kind ? ` es-${kind}` : ''}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Notice({
  kind = 'info',
  children,
  actions,
  live,
}: {
  kind?: 'info' | 'warning' | 'error' | undefined;
  children: ReactNode;
  actions?: ReactNode | undefined;
  live?: 'alert' | 'status' | undefined;
}) {
  return (
    <div
      className={`es-notice es-notice-${kind}`}
      role={live ?? (kind === 'error' ? 'alert' : undefined)}
    >
      <div className="es-notice-text">{children}</div>
      {actions && <div className="es-notice-actions">{actions}</div>}
    </div>
  );
}

/** Text typed here is kept locally while editing and saved after a pause, on Enter or on blur. */
function useDraft(value: string, commit: (next: string) => void, delay: number) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ draft, value, commit });
  latest.current = { draft, value, commit };
  useEffect(() => () => clearTimeout(timer.current), []);
  const flush = () => {
    clearTimeout(timer.current);
    const { draft: pending, value: current, commit: save } = latest.current;
    if (pending !== null && pending !== current) save(pending);
    setDraft(null);
  };
  const edit = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { value: current, commit: save } = latest.current;
      if (next !== current) save(next);
    }, delay);
  };
  return { shown: draft ?? value, editing: draft !== null, edit, flush };
}

export function TextField({
  value,
  onCommit,
  label,
  placeholder,
  id,
  disabled,
  maxLength,
  inputRef,
  onFocus,
  invalid,
  describedBy,
  mono,
  list,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string | undefined;
  id?: string | undefined;
  disabled?: boolean | undefined;
  maxLength?: number | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  onFocus?: (() => void) | undefined;
  invalid?: boolean | undefined;
  describedBy?: string | undefined;
  mono?: boolean | undefined;
  list?: string | undefined;
}) {
  const draft = useDraft(value, onCommit, 600);
  return (
    <input
      ref={inputRef}
      id={id}
      className={`es-input${mono ? ' es-mono' : ''}`}
      type="text"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      placeholder={placeholder}
      list={list}
      value={draft.shown}
      disabled={disabled}
      maxLength={maxLength}
      spellCheck={false}
      autoComplete="off"
      onFocus={onFocus}
      onChange={(event) => draft.edit(event.target.value)}
      onBlur={draft.flush}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) draft.flush();
      }}
    />
  );
}

export function TextArea({
  value,
  onCommit,
  label,
  placeholder,
  id,
  rows = 5,
  describedBy,
  invalid,
  validate,
  maxLength,
  onDraft,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string | undefined;
  id?: string | undefined;
  rows?: number | undefined;
  describedBy?: string | undefined;
  invalid?: boolean | undefined;
  /** Called with every edit; the text is only saved while it returns true. */
  validate?: ((value: string) => boolean) | undefined;
  maxLength?: number | undefined;
  onDraft?: ((value: string) => void) | undefined;
}) {
  const draft = useDraft(
    value,
    (next) => {
      if (!validate || validate(next)) onCommit(next);
    },
    700,
  );
  return (
    <textarea
      id={id}
      className="es-input es-textarea es-mono"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      placeholder={placeholder}
      rows={rows}
      value={draft.shown}
      maxLength={maxLength}
      spellCheck={false}
      onChange={(event) => {
        draft.edit(event.target.value);
        onDraft?.(event.target.value);
      }}
      onBlur={draft.flush}
    />
  );
}

/** A number in a range, saved only while valid; an out-of-range draft says why and is not saved. */
export function NumberField({
  value,
  onCommit,
  label,
  min,
  max,
  step = 1,
  integer,
  unit,
  id,
  disabled,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  min: number;
  max: number;
  step?: number | undefined;
  integer?: boolean | undefined;
  unit?: string | undefined;
  id?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const message = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  const parse = (text: string): number | null => {
    if (!text.trim()) return null;
    const number = Number(text);
    if (!Number.isFinite(number) || number < min || number > max) return null;
    if (integer && !Number.isInteger(number)) return null;
    return number;
  };
  const shown = draft ?? String(value);
  const parsed = parse(shown);
  const invalid = draft !== null && parsed === null;
  const save = (text: string) => {
    const number = parse(text);
    if (number !== null && number !== value) onCommit(number);
  };
  return (
    <span className="es-number">
      <span className="es-number-field">
        <input
          id={id}
          className="es-input"
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? message : undefined}
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={disabled}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => save(text), 450);
          }}
          onBlur={() => {
            clearTimeout(timer.current);
            if (draft !== null) save(draft);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          }}
        />
        {unit && <span className="es-unit">{unit}</span>}
      </span>
      {invalid && (
        <span id={message} className="es-field-error" role="alert">
          请输入 {min} 到 {max} 之间的{integer ? '整数' : '数值'}
        </span>
      )}
    </span>
  );
}

/** A plain controlled input, for forms that are submitted as a whole instead of saved as typed. */
export function LiveField({
  value,
  onChange,
  label,
  placeholder,
  id,
  invalid,
  maxLength,
  mono,
  list,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string | undefined;
  id?: string | undefined;
  invalid?: boolean | undefined;
  maxLength?: number | undefined;
  mono?: boolean | undefined;
  list?: string | undefined;
}) {
  return (
    <input
      id={id}
      className={`es-input${mono ? ' es-mono' : ''}`}
      type="text"
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      list={list}
      value={value}
      maxLength={maxLength}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
