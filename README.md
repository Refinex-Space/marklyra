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

Node.js 22+、pnpm 10.33.0 和 Rust stable 为开发依赖。Windows 还需安装 Visual Studio C++ 构建工具和 WebView2，macOS 需安装 Xcode Command Line Tools。

开发运行与 debug 构建使用独立的 `marklyra-dev` 原生数据/配置目录，release 构建继续使用 `marklyra`，避免开发实例与安装版竞争草稿存储锁。开发目录从默认配置开始，不迁移或清理安装版的设置和草稿；图谱索引也随构建环境隔离。

编辑器引擎、页面、样式、语言包及随附库由 `packages/editor-runtime` 直接管理，主题位于 `packages/editor-themes`，设置页和原生标题栏图像位于 `apps/desktop`。这些源码随 Git 克隆，无需手动复制本机目录或安装其他编辑器。`pnpm prepare:runtime` 校验内部源码、构建适配层并生成 `packages/editor-runtime/dist/page`；开发和打包命令会自动执行。身份清单中的输入按原始字节检出，不受 Windows `core.autocrlf` 影响。目录与验证约定见 [内部源码构建](docs/RUNTIME-SOURCE-VERIFICATION.md)。

## 验证

```sh
pnpm typecheck
pnpm check:boundaries
pnpm check:resources
node scripts/check-provenance.mjs --worktree
pnpm test
pnpm test:runtime-transform
pnpm test:runtime
pnpm test:desktop-shell
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --lib --bins --locked
```

浏览器套件使用 Chromium/WebKit；真实 WKWebView、WebView2、系统输入法、打印和文件关联需在对应宿主验证。`cargo test --test` 的原生 GUI harness 使用隔离夹具单独运行。性能测量的输入冻结、计时边界和复现步骤见 [性能工具说明](tools/performance/README.md)。

## 模块

- `packages/editor-runtime`：`@marklyra/editor-runtime`，提供 `MarkLyraEditor`、命令、事件、图片及导出适配。
- `packages/editor-core`、`editor-markdown`、`editor-view`：源文本事务、映射、语法和 DOM 视图。
- `packages/editor-react`、`editor-extensions`、`editor-themes`：React 生命周期、扩展及样式。
- `apps/desktop`：桌面窗口、设置和受限原生服务。
- `crates`：文档、目录、图片、导出、最近文件及崩溃草稿存储。
- `config`：构建输入身份与应用配置。

所有文件保存以源文本为准，保留编码、BOM 和换行；崩溃草稿、撤销重做和自动保存是产品能力。配置、编译、打包、运行和签名分别验证。

仓库地址：`git@github.com:Refinex-Space/marklyra.git`。项目使用根 [LICENSE](LICENSE) 的 Apache-2.0；必要第三方通知统一维护在 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)，构建时直接附带。

## 版本发布

Mac、Windows GitHub Release 构建、首次密钥配置、版本递增、草稿验收与手动发布步骤见 [发布与更新手册](docs/releases/README.md)。应用内更新不显示版本摘要；平台安装包无需付费签名证书。

依赖版本更新后运行 `pnpm update:notices` 更新合并通知；正常开发和构建不需要维护逐组件许可文件。
