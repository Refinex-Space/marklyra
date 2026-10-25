# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

协作、架构边界与验证要求以上面导入的 AGENTS.md 为准；安装、完整验证命令清单见 [README](README.md)。以下只补充它们没有写的内容。

## 单个测试怎么跑

```sh
pnpm exec vitest run <file> -t "<name>"                                   # 单元测试
pnpm exec playwright test -c playwright.desktop.config.ts tests/desktop-e2e/<x>.spec.ts -g "<name>"  # 桌面壳浏览器测试
cargo test -p marklyra-desktop --lib <filter>                             # Rust
```

- 桌面壳测试没有真实 Tauri：`tests/desktop-e2e/desktop.helpers.ts` 的 `installMock` 替身 `invoke`，选项 `{ nativeChrome, titlebar: 'web' | 'appkit', home }`。浏览器替身验证不了真实 WebView2/WKWebView 行为。
- Windows 上 `cargo test -p marklyra-desktop --lib` 需要给测试可执行文件嵌入 comctl32 清单，否则启动即失败；macOS 专属代码（`platform/ui_chrome/macos.rs`、`#[cfg(target_os = "macos")]`）在 Windows 上无法运行，只能用 `cargo check --target aarch64-apple-darwin` 做类型检查（需要能编译 `objc2-exception-helper` 构建脚本的 C 编译器）。
- 工作副本可能是 CRLF（`core.autocrlf`），仓库内容是 LF（`.gitattributes`）。脚本式批量编辑要兼容两种行尾；不要对目录运行 `biome format --write`，只对明确的文件运行。

## 大图景

- **三层隔离**：`packages/*` 按模块管理编辑器源码与 SDK（core/markdown 为纯 TS 且无 DOM）；编辑器和设置页都跑在隔离 iframe 运行页（`packages/editor-runtime/dist/page`，由 `prepare:runtime` 从各自所属包和应用源码生成），与壳只通过类型化消息通信，运行页没有 IPC 或文件系统权限；`apps/desktop/src-tauri` 是唯一的原生宿主。
- **壳** `apps/desktop/src/app/App.tsx` 是体量很大的单一编排点：文档会话（`features/documents/useDocumentSession.ts`）、侧栏、右侧大纲/AI、设置页都在这里装配。编辑器 iframe 始终挂载；首页（`features/home`）、快速打开是覆盖在文档卡片上的视图，编辑器此时 `inert`，编辑命令必须经 `editorObscured` 拦截。
- **标题栏两套实现**：Windows 用 Web 标题栏（`components/Titlebar.tsx`），macOS 用 AppKit 原生标题栏（`src-tauri/src/platform/ui_chrome/macos.rs`）。壳状态通过 `services/ui-chrome.ts` → `update_editor_chrome` 同步给原生一侧；新增标题栏控件通常两边都要改。
- **原生菜单与壳状态镜像**：TS 的 `features/menus/native-menu-state.ts` 与 Rust 的 `src-tauri/src/menu.rs`、`menu/state.rs` 描述同一套启用规则，改一边必须改另一边，菜单 ID 数量有测试断言。
- **"关闭文档"** 就是 `doc.request({ kind: 'new' })`（替换为空白未命名文档，复用未保存确认），首页由 `doc.file`、脏状态、`doc.snapshot` 推导，不是单独的路由。

## 骨架屏（Skeleton）加载规范

异步读取内容的区域，在内容到达前显示内容轮廓的骨架，不留空白，也不用“加载中…”“正在读取…”这类文字。

- 统一使用 `apps/desktop/src/components/Skeleton.tsx`：`Skeleton`（容器）、`SkeletonBar`、`SkeletonRows`（列表）。不要另写动效或配色；所在表面有自己的文字色时，只设置 `--skeleton-ink`。场景骨架（`DocumentSkeleton`、`SettingsSkeleton`、`SidebarSkeleton`、`ExportSettingsSkeleton`）只负责拼出该区域的轮廓。
- 轮廓对齐真实内容：行高、卡片内边距、列宽与加载后一致，数据到达时不产生布局跳动。骨架本身不含可见文字。
- 容器带 `role="status"` 和 `aria-label`（默认“正在读取”），骨架在 140ms 后才淡入，短读取不闪现；`prefers-reduced-motion` 下不播放扫光。这些由共享 CSS 保证，不要绕开。
- 失败、空、加载是三种不同状态：失败显示错误和重试，空显示空状态，都不能让骨架无限停留；需要给“永远等不到”的情况留出口（见 `App.tsx` 的 `startupFailed`）。
- 不适用骨架的：动作进度（保存、移动、检查更新）和输入校验提示，保持短状态文字；`doc.working` 同时覆盖保存与自动保存，不能用它驱动文档骨架。
- 验证：用 `tests/desktop-e2e/skeletons.spec.ts` 的方式拖慢依赖（`page.route` 延迟运行页，或包装 `invoke`），断言骨架可见、无加载文字、结束后消失。
