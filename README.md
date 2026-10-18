# MarkLyra

Markdown 桌面编辑器与独立 TypeScript 编辑器 SDK，采用 Tauri、Rust、React 和 Vite。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm desktop
pnpm build
pnpm build:desktop --debug
```

Node.js 22+、pnpm 10.33.0 和 Rust stable 为开发依赖。桌面编辑运行时从本地受授权资源构建，源输入位于 `private/vendor/TypeMark`，macOS 标题栏图像位于 `private/native-titlebar`；资源必须与 `config/runtime-source.json` 和图像清单匹配。私有资源不进入 Git 或 SDK 归档。

## 验证

```sh
pnpm typecheck
pnpm check:boundaries
pnpm test
pnpm test:runtime-transform
pnpm test:runtime
pnpm test:desktop-shell
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --lib --bins --locked
```

浏览器套件使用 Chromium/WebKit；真实 WKWebView、WebView2、系统输入法、打印和文件关联需在对应宿主验证。`cargo test --test` 的原生 GUI harness 使用隔离夹具单独运行。

## 模块

- `packages/editor-runtime`：`@marklyra/editor-runtime`，提供 `MarkLyraEditor`、命令、事件、图片及导出适配。
- `packages/editor-core`、`editor-markdown`、`editor-view`：源文本事务、映射、语法和 DOM 视图。
- `packages/editor-react`、`editor-extensions`、`editor-themes`：React 生命周期、扩展及样式。
- `apps/desktop`：桌面窗口、设置和受限原生服务。
- `crates`：文档、目录、图片、导出、最近文件及崩溃草稿存储。
- `config`：资源身份、依赖和分发校验清单。

所有文件保存以源文本为准，保留编码、BOM 和换行；崩溃草稿、撤销重做和自动保存是产品能力。配置、编译、打包、运行和签名分别验证。

仓库地址：`git@github.com:Refinex-Space/marklyra.git`。本地运行资源单独管理；第三方资源与依赖的许可约束见 [licenses](licenses/README.md)。
