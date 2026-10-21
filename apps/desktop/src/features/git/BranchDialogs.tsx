import { type ReactNode, type SyntheticEvent, useEffect, useId, useState } from 'react';
import { type GitBranches, git } from '../../services/git.js';
import { checkoutBranch } from './branch-actions.js';
import { branchStore } from './branch-store.js';
import { GitDialogFrame } from './GitDialogFrame.js';
import { type GitDialog, useGit } from './GitProvider.js';
import { branchNameError } from './git-preferences.js';

/** Form dialog with a primary action; Enter submits, the action runs once. */
function FormDialog(props: {
  title: string;
  active: boolean;
  submit: string;
  danger?: boolean;
  disabled?: boolean;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}) {
  const { closeDialog } = useGit();
  const [working, setWorking] = useState(false);
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (props.disabled || working) return;
    setWorking(true);
    try {
      await props.onSubmit();
    } finally {
      setWorking(false);
    }
  };
  return (
    <GitDialogFrame
      title={props.title}
      active={props.active}
      onClose={closeDialog}
      locked={working}
      size="small"
    >
      <form className="git-form" onSubmit={(event) => void submit(event)}>
        {props.children}
        <div className="git-form-actions">
          <button type="button" className="git-button" disabled={working} onClick={closeDialog}>
            取消
          </button>
          <button
            type="submit"
            className={`git-button ${props.danger ? 'git-button-danger' : 'git-button-primary'}`}
            disabled={props.disabled || working}
          >
            {props.submit}
          </button>
        </div>
      </form>
    </GitDialogFrame>
  );
}

function Field(props: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: (id: string, describedBy: string) => ReactNode;
}) {
  const id = useId();
  const hint = useId();
  return (
    <div className="git-field">
      <label htmlFor={id}>{props.label}</label>
      {props.children(id, hint)}
      {props.error ? (
        <p className="git-field-error" id={hint} role="alert">
          {props.error}
        </p>
      ) : props.hint ? (
        <p className="git-field-hint" id={hint}>
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}

export function useBranches() {
  const { workspace, revision } = useGit();
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const id = workspace?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after mutations.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void git.branches(id).then(
      (value) => {
        if (alive) setBranches(value);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [id, revision]);
  return branches;
}

export function NewBranchDialog(props: {
  dialog: Extract<GitDialog, { kind: 'new-branch' }>;
  active: boolean;
}) {
  const context = useGit();
  const branches = useBranches();
  const suggested =
    props.dialog.from.includes('/') && !branches?.local.some((b) => b.name === props.dialog.from)
      ? props.dialog.from.slice(props.dialog.from.indexOf('/') + 1)
      : '';
  const [name, setName] = useState(suggested);
  const [checkout, setCheckout] = useState(props.dialog.checkout);
  const [touched, setTouched] = useState(false);
  const exists = branches?.local.some((branch) => branch.name === name.trim()) ?? false;
  const error = branchNameError(name) ?? (exists ? `已存在名为“${name.trim()}”的本地分支` : null);
  return (
    <FormDialog
      title="新建分支"
      active={props.active}
      submit={checkout ? '创建并签出' : '创建'}
      disabled={!!error}
      onSubmit={async () => {
        let done = false;
        await context.run(
          '新建分支',
          async (id) => {
            await git.createBranch(id, name.trim(), props.dialog.from, checkout);
            done = true;
          },
          {
            touchesWorkTree: checkout,
            success: () => (checkout ? `已创建并签出 ${name.trim()}` : `已创建分支 ${name.trim()}`),
          },
        );
        if (done) {
          const root = context.probe?.repository?.root;
          if (root && checkout) branchStore.visit(root, name.trim());
          context.closeDialog();
        }
      }}
    >
      <Field label="新分支名称" error={touched ? error : null} hint={`基于 ${props.dialog.from}`}>
        {(id, hint) => (
          <input
            id={id}
            className="git-input"
            autoFocus
            value={name}
            spellCheck={false}
            aria-invalid={touched && !!error}
            aria-describedby={hint}
            placeholder="feature/新功能"
            onChange={(event) => {
              setName(event.target.value);
              setTouched(true);
            }}
          />
        )}
      </Field>
      <label className="git-check">
        <input
          type="checkbox"
          checked={checkout}
          onChange={(event) => setCheckout(event.target.checked)}
        />
        签出该分支
      </label>
    </FormDialog>
  );
}

export function RenameBranchDialog(props: { name: string; active: boolean }) {
  const context = useGit();
  const branches = useBranches();
  const [name, setName] = useState(props.name);
  const exists =
    name.trim() !== props.name && (branches?.local.some((b) => b.name === name.trim()) ?? false);
  const error =
    name.trim() === props.name
      ? '请输入新的名称'
      : (branchNameError(name) ?? (exists ? '已存在同名分支' : null));
  return (
    <FormDialog
      title={`重命名分支“${props.name}”`}
      active={props.active}
      submit="重命名"
      disabled={!!error}
      onSubmit={async () => {
        let done = false;
        await context.run(
          '重命名分支',
          async (id) => {
            await git.renameBranch(id, props.name, name.trim());
            done = true;
          },
          { success: () => `已重命名为 ${name.trim()}` },
        );
        if (done) {
          const root = context.probe?.repository?.root;
          if (root) branchStore.rename(root, props.name, name.trim());
          context.closeDialog();
        }
      }}
    >
      <Field
        label="新名称"
        error={name !== props.name ? error : null}
        hint="远程上的同名分支不会被重命名。"
      >
        {(id, hint) => (
          <input
            id={id}
            className="git-input"
            autoFocus
            value={name}
            spellCheck={false}
            aria-describedby={hint}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
    </FormDialog>
  );
}

export function CheckoutRevisionDialog({ active }: { active: boolean }) {
  const context = useGit();
  const branches = useBranches();
  const [revision, setRevision] = useState('');
  const listId = useId();
  const value = revision.trim();
  const invalid = !value || value.startsWith('-') || /\s/.test(value);
  return (
    <FormDialog
      title="签出标签或修订"
      active={active}
      submit="签出"
      disabled={invalid}
      onSubmit={async () => {
        if (await checkoutBranch(context, value, 'revision')) context.closeDialog();
      }}
    >
      <Field
        label="标签、提交哈希或表达式"
        hint="签出后处于“分离 HEAD”状态；需要继续工作时请从此处新建分支。"
      >
        {(id, hint) => (
          <input
            id={id}
            className="git-input git-mono"
            autoFocus
            list={listId}
            value={revision}
            spellCheck={false}
            aria-describedby={hint}
            placeholder="v1.0.0、a1b2c3d、HEAD~2"
            onChange={(event) => setRevision(event.target.value)}
          />
        )}
      </Field>
      <datalist id={listId}>
        {branches?.tags.map((tag) => (
          <option key={tag.name} value={tag.name} />
        ))}
      </datalist>
    </FormDialog>
  );
}

export function TagDialog(props: { target: string; label: string; active: boolean }) {
  const context = useGit();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const error = branchNameError(name)?.replace(/分支/g, '标签') ?? null;
  return (
    <FormDialog
      title="新建标签"
      active={props.active}
      submit="创建标签"
      disabled={!!error}
      onSubmit={async () => {
        let done = false;
        await context.run(
          '新建标签',
          async (id) => {
            await git.createTag(id, name.trim(), props.target, message.trim());
            done = true;
          },
          { success: () => `已在 ${props.label} 创建标签 ${name.trim()}` },
        );
        if (done) context.closeDialog();
      }}
    >
      <Field label="标签名称" error={name ? error : null} hint={`指向 ${props.label}`}>
        {(id, hint) => (
          <input
            id={id}
            className="git-input"
            autoFocus
            value={name}
            spellCheck={false}
            aria-describedby={hint}
            placeholder="v1.0.0"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Field label="附注（可选）" hint="填写后创建附注标签，否则创建轻量标签。">
        {(id, hint) => (
          <textarea
            id={id}
            className="git-input"
            rows={3}
            value={message}
            aria-describedby={hint}
            onChange={(event) => setMessage(event.target.value)}
          />
        )}
      </Field>
    </FormDialog>
  );
}

const RESET_MODES = {
  soft: '保留更改并暂存（--soft）：之后的提交内容回到暂存区',
  mixed: '保留更改（--mixed）：之后的提交内容回到工作区，未暂存',
  hard: '丢弃更改（--hard）：工作区与暂存区都恢复到该提交，未提交的修改会丢失',
} as const;
export function ResetDialog(props: { target: string; label: string; active: boolean }) {
  const context = useGit();
  const [mode, setMode] = useState<'soft' | 'mixed' | 'hard'>('mixed');
  const branch = context.probe?.repository?.head.branch ?? 'HEAD';
  return (
    <FormDialog
      title={`将 ${branch} 重置到此处`}
      active={props.active}
      submit="重置"
      danger={mode === 'hard'}
      onSubmit={async () => {
        await context.run('重置', (id) => git.reset(id, props.target, mode), {
          touchesWorkTree: mode === 'hard',
          success: () => `已将 ${branch} 重置到 ${props.label}`,
        });
        context.closeDialog();
      }}
    >
      <p className="git-form-text">目标提交：{props.label}</p>
      <fieldset className="git-radio-group">
        <legend>重置方式</legend>
        {(Object.keys(RESET_MODES) as (keyof typeof RESET_MODES)[]).map((key) => (
          <label key={key} className="git-radio">
            <input
              type="radio"
              name="reset-mode"
              checked={mode === key}
              onChange={() => setMode(key)}
            />
            <span>{RESET_MODES[key]}</span>
          </label>
        ))}
      </fieldset>
    </FormDialog>
  );
}

export function ConfirmDialog(props: {
  dialog: Extract<GitDialog, { kind: 'confirm' }>;
  active: boolean;
}) {
  const { closeDialog } = useGit();
  const [option, setOption] = useState(false);
  const { dialog } = props;
  return (
    <FormDialog
      title={dialog.title}
      active={props.active}
      submit={dialog.confirm}
      danger={dialog.danger === true}
      onSubmit={async () => {
        closeDialog();
        await dialog.run(option);
      }}
    >
      <div className="git-form-text">{dialog.message}</div>
      {dialog.option && (
        <label className="git-check">
          <input
            type="checkbox"
            checked={option}
            onChange={(event) => setOption(event.target.checked)}
          />
          {dialog.option}
        </label>
      )}
    </FormDialog>
  );
}

export function InitDialog({ active }: { active: boolean }) {
  const context = useGit();
  const [branch, setBranch] = useState(context.preferences.defaultBranch);
  const [gitignore, setGitignore] = useState(true);
  const error = branchNameError(branch);
  return (
    <FormDialog
      title="初始化 Git 仓库"
      active={active}
      submit="初始化"
      disabled={!!error}
      onSubmit={async () => {
        const result = await context.run(
          '初始化仓库',
          (id) => git.init(id, branch.trim(), gitignore),
          {
            success: () => '已初始化 Git 仓库',
          },
        );
        if (result) {
          context.closeDialog();
          if (branch.trim() !== context.preferences.defaultBranch)
            context.setPreferences({ defaultBranch: branch.trim() });
        }
      }}
    >
      <p className="git-form-text">
        将在“{context.workspace?.name}”中创建 .git 目录。现有文件不会被修改或自动提交。
      </p>
      <Field label="默认分支名称" error={error}>
        {(id, hint) => (
          <input
            id={id}
            className="git-input"
            value={branch}
            spellCheck={false}
            aria-describedby={hint}
            onChange={(event) => setBranch(event.target.value)}
          />
        )}
      </Field>
      <label className="git-check">
        <input
          type="checkbox"
          checked={gitignore}
          onChange={(event) => setGitignore(event.target.checked)}
        />
        创建适合笔记库的 .gitignore（忽略系统临时文件）
      </label>
    </FormDialog>
  );
}

export { Field, FormDialog };
