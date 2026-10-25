# Windows 外壳与跨平台一致性

MarkLyra 在 macOS 与 Windows 上共用同一套 Shell、侧栏、编辑器、设置页与 AI 面板。两端只允许存在由操作系统决定的差异：窗口控制（红绿灯 / 右上角最小化、最大化、关闭）、快捷键名称（⌘ / Ctrl）以及 macOS 独有的原生标签页。

## 外壳结构

| 部分 | macOS | Windows |
| --- | --- | --- |
| 标题栏 | AppKit 覆盖式标题栏与附件视图（`platform/ui_chrome/macos.rs`） | WebView 自绘统一标题栏（`apps/desktop/src/components/Titlebar.tsx`），高度 32px（macOS 为 28pt） |
| 窗口控制 | 原生红绿灯 | 46px 宽的最小化 / 最大化 / 关闭按钮，Windows 11 几何；窗口无系统装饰（`tauri.windows.conf.json`、`windows.rs`） |
| 菜单 | 系统菜单栏 | 原生菜单仍是唯一数据源：标题栏只渲染顶层标题并调用 `popup_app_menu` 弹出对应的原生子菜单；窗口宽度小于 940px 时折叠为一个菜单按钮 |
| 快捷键 | 原生菜单加速键 | WebView2 持有键盘焦点，窗口收不到 Win32 加速键消息；由 `AcceleratorKeyPressed` 在页面之前按菜单显示的同一套快捷键匹配并分发（`menu/accelerator.rs`、`platform/ui_chrome/windows.rs`）。禁用的菜单项不拦截按键 |
| 窗口缩放 / 拖动 | 系统 | 顶部由 Tauri 覆盖层、其余三边由无装饰窗口的不可见系统边框处理；标题栏空白处拖动、双击最大化 |
| 滚动条 | 叠加式 | 通过 `additionalBrowserArgs` 启用 WebView2 的 Fluent 叠加滚动条；所有 WebView2 窗口必须传完全相同的参数（`windows.rs::WEBVIEW_BROWSER_ARGS`） |
| 设置页 | `os=mac` 页面 | 同样使用 `os=mac` 页面布局与控件集合；`hostOs=win` 仅调整真实系统差异（Ctrl 键文案、隐藏 macOS 专属的“关闭窗口后退出”） |

标题栏高度通过 `--titlebar-height` 传给所有依赖顶部带宽的样式，内容区顶部边距由 `setContentInset` 使用同一数值。

## 三栏卡片布局

文件侧栏、文档区、右侧目录 / AI 面板在两端使用同一套卡片样式（`style.css` 的 `--pane-*` 变量）：8px 窗口间距与窗格间距、1px 细边框、8px 圆角，铺在略深于文档底色的画布（`--shell-canvas`）上；标题栏带同样使用该画布色。窗格顶部位于标题栏下方 4px（全屏时为 8px）。窗格之间的间隙就是拖动手柄。

三块窗格使用同一个填充色（`--sidebar` 在原生外壳下等于文档底色），不再为侧栏单独设色；卡片之间只靠画布和 1px 边框区分。设置页（嵌入式）同样是“导航卡片 + 内容卡片”两块，位置、间距、圆角、边框、填充与主窗口一致，侧栏宽度共用同一个值，拖动手柄也落在两块之间的间隙。

窗格之间的 8px 间隙整体就是拖动手柄（两侧各多出 3px 命中范围）。悬停片刻或拖动时，间隙中点出现一个短的圆角握把（3×36px），不再是整条竖线。右侧目录 / AI 面板的手柄是面板的前一个兄弟节点而不是它的子节点，否则会被面板的 `overflow: hidden` 裁在卡片里。拖动期间只直接更新 DOM（侧栏宽度、`--document-details-width`）和 `aria-valuenow`，松手时一次性提交状态；编辑器运行时也不再因为布局变量（`--marklyra-content-*`）变化而重读整套主题 CSS。

Windows 标题栏右上角的文档操作（统计、目录、侧栏、AI）与系统按钮之间有一条 1×16px 的浅色短竖线，上下都不触及标题栏边缘。

编辑器 iframe 在水平方向仍铺满窗口（主题媒体查询与查找条依赖整窗宽度），但滚动区域的左右边界由宿主按文档卡片的内边缘计算（`setContentInset` 的 left / right），垂直方向与卡片等高；iframe 用圆角 `clip-path` 裁成卡片形状。因此文档滚动条位于文档卡片自己的右边缘，而不是贴着窗口边缘，也不再需要右栏为滚动条预留 20px 空隙。

## 焦点判定

`WebviewWindow::is_focused()` 在 Windows 上只反映顶层 HWND 的键盘焦点；页面获得焦点后 WebView2 会拿走它，导致所有“窗口必须聚焦”的授权（菜单状态、剪贴板、外部链接、右键菜单、系统打开……）全部失败。所有调用统一经过 `crate::windows::is_focused`，Windows 上额外接受前台窗口。

## Windows 补齐的原生能力

- **单实例**：第二次启动（资源管理器“打开方式”、双击文件）把参数通过命名互斥体与 `WM_COPYDATA` 转交给运行中的实例后退出，转交内容与本进程命令行一样只生成系统拥有的打开回执（`platform/single_instance.rs`）。调试构建可用 `MARKLYRA_ALLOW_MULTIPLE_INSTANCES=1` 跳过。
- **系统外观**：标题栏会把窗口主题强制成文档主题，因此“跟随系统外观”改读个性化注册表项 `AppsUseLightTheme`，不再读窗口主题。
- **受控图片下载**：与 macOS 相同的限制（不跟随重定向、不走代理、8 MiB、可取消），使用系统自带的 `curl.exe`。
- **文件操作确认**：删除 / 移动对话框改为与 macOS 简体中文版相同的文案。
- **隐藏文件**：目录列表不显示带“隐藏”或“系统”属性的条目，与资源管理器一致。

## 与 macOS 的能力差异（未完成项）

- **文件拖入窗口**：WebView2 的拖放目标位于浏览器进程，无法在宿主进程中包装 `OleDropTargetInterface`（已在真机验证该属性值不是可用的 COM 指针）；启用 Tauri 的拖放处理会同时破坏页面内的 HTML5 拖放（侧栏条目移动、编辑器内文字拖动）。改用 `AllowExternalDrop(false)` 加自有 OLE 目标的方案未能在真机上验证页面内拖放不受影响，因此没有接入。当前 Windows 上设置页的“拖放行为”选项对非图片文件与文件夹无效，图片文件仍通过浏览器 `File` 路径导入。
- **统一的文件 / 图片 / 文本剪贴板快照**：仅 macOS 使用；Windows 继续使用逐项读取的剪贴板命令。
- **整篇图片导出**：仅 macOS 提供（WKWebView 快照），Windows 的 `export-image` 菜单项保持禁用。
- **原生标签页**：macOS 独有，Windows 使用独立窗口。

## 验证说明

- 浏览器 e2e 使用 `installLayout(page, undefined, 'web')` 模拟 Windows 宿主（`tests/desktop-e2e/windows-titlebar.spec.ts`），宿主 IPC 为测试替身。
- Windows 真机需独立验证标题栏、原生菜单、窗口拖动／缩放／最大化、加速键、全屏、设置页和滚动条；浏览器中的平台模拟不能替代 WebView2 宿主验收。
- Windows 上 `cargo test --lib` 的测试二进制需要 comctl32 v6 清单；准备步骤见[发布手册](releases/README.md#2-本地验证)。测试结果以本次执行为准，不沿用历史失败数量。
