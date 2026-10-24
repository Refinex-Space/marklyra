# ACP AI 验收记录

验证日期：2026-10-19。实际宿主：macOS ARM64。

**第一期交付验证：1511 项 TypeScript 测试、142 个 Chromium/WebKit 浏览器用例、543 项 Rust 宿主库测试通过（4 项既有 ignored），类型/依赖边界、lint、fmt、clippy 和 macOS ARM64 开发构建通过。图片查看层最终补充 6 项专项复测通过。本轮系统打开/保存面板未由自动化触发；相关浏览器动作使用 IPC 替身，原生字节/归属/私有副本与清理行为使用合成文件验证。此前在线智能体、安装和钥匙串证据保留在下文。**

## 图片查看层与第一期提交前回归

图片从表单弹窗迁移到四周 8px 留白的接近全窗口查看层，唯一关闭入口，无额外图片/卡片阴影。右上角按参考图收紧缩放、打开副本、下载和关闭控件；底部居中 32px 高工具条。用户已明确本期提供本地标注、评论和尺寸调整，不做 AI 去背景/擦除。图标使用 Tabler v3.35.0 正式资源，增补标题元数据，几何保持原样，许可证和双摘要均校验。

本地编辑支持归一化标注、评论、锁定比例/有界尺寸、撤销和导出 PNG 副本；保存取消不丢弃修改，未应用输入不能被静默漏掉，关闭前确认未导出修改。提交评论/尺寸和撤销后焦点保留在图片区，原生/fallback 嵌套确认只处理最上层窗口。打开和下载走真实的窄类型原生命令，栅格内容/MIME 校验后才保存/打开；私有临时文件、目录替换后的安全清理及精确字节已有测试，不写入原始附件。

IAB 同屏检查了用户图 2 与真实渲染（含右上角、底部局部），修正样式级联、控件密度及焦点逃逸后通过设计 QA。原始截图密度未知，归一化比例不冒充真实 DPR；保留本应用系统字体和背景，工具数按用户确认范围精简。最终控制台 error/warn 为空。完整设计证据在本地生成的 `design-qa.md`，随截图置于 Git 忽略范围。

最终验证：

- `pnpm check`：122 文件、1511 测试，类型与依赖边界通过；`pnpm lint`：702 文件通过。图标适配后专属 4 项测试及类型/lint 再次通过，验证打包摘要和移除标题后与上游原始字节一致。
- 浏览器总计 142 项通过，包含 AI、原生输入、第三栏、设置窗口；最后查看层与 fallback 6 项复测通过。此前图片编辑专项 24 项通过，含评论/标注/尺寸/撤销、真实画布编码、原始字节保持、未保存保护、模态焦点和其他弹窗回归，重复项不累计。
- Rust 宿主库 543 通过、4 项既有 ignored；fmt、clippy --all-targets -D warnings 通过。新增图片相关 4 项测试覆盖格式/类型、字节一致、私有权限和路径被替换后的句柄清理。
- macOS ARM64 app/DMG 重新生成（未签名）。未重启现有应用，未更改用户文稿、密钥或系统默认应用。

日志：`artifacts/acp-ai/phase1-browser-final.log`、`phase1-viewer-final.log`、`phase1-check-final.log`、`phase1-typecheck-final.log`、`phase1-lint-final.log`、`phase1-rust-final.log`、`phase1-fmt-final.log`、`phase1-clippy-final.log`、`phase1-build-final.log`、`image-viewer-unit-final.log`。截图与同屏对照：`artifacts/acp-ai/image-viewer-ui/`。

## 会话列表与批量清理

历史行改为勾选框、图标/标题块、操作图标同排；标题省略，完整名称保留 tooltip。会话和归档支持勾选、半选、全选当前搜索结果和批量删除，改变搜索/标签后清空选择。归档页提供“清空归档”，确认当前工作区全部归档数量且说明不受搜索影响；取消不发送管理请求。80 条分批呈现，全选覆盖完整筛选结果。

普通会话先归档再删除，归档直接删除；显示进度，锁定重复操作和对话切换；运行中的当前会话拒绝删除。逐项失败不影响其余项，失败对象保留已归档状态用于重试。刷新有工作区归属检查。历史接口移除 1000 条截断，对超过 10000 项的目录明确失败，不以部分结果进行清空。

验证：最终 24 个 Chromium/WebKit 用例通过，覆盖浅深主题、280px 对齐/省略、查询和标签范围、取消、全部归档、批量部分失败重试、处理中 Escape/按钮锁定、分批展示后的全选、运行中拒绝，以及既有附件/草稿/过程/历史管理。图标宽度视觉修正后 4 个布局用例复测通过，截图已查看。macOS ARM64 开发 app/DMG 已重建（未签名）。`pnpm check`：121 文件、1507 测试、类型及依赖边界通过；lint 689 文件通过。批量删除单元 2 项通过；Rust 历史相关 3 项通过，含 1001 条历史仍返回最早归档，fmt 和 clippy --lib -D warnings 通过。未执行真实用户会话删除或跨窗口设备 UI 验收。

日志：`artifacts/acp-ai/history-bulk-browser-final.log`、`history-bulk-layout-final.log`、`history-bulk-unit.log`、`history-bulk-check-final.log`、`history-bulk-lint-final.log`、`history-bulk-rust.log`、`history-bulk-clippy.log`、`history-bulk-fmt.log`、`history-bulk-build.log`；截图：`artifacts/acp-ai/history-bulk-ui/`。

## 处理过程操作栏与工具输出折叠

修正过程区复用普通消息操作栏的问题：思考、工具调用、计划和过程说明不再各自生成复制按钮与时间；这些操作仅保留在用户消息和最终回复。工具输出不再由运行阶段强制展开，默认折叠；用户手动展开后，后续工具更新保留展开状态，重开历史时恢复默认折叠。历史数据格式不变。

8 项浅深主题 × Chromium/WebKit 回归通过，覆盖运行/完成/历史重开、手动展开后流式更新、过程区操作栏缺失以及用户/最终回复操作栏保留。类型检查与 lint 通过；本轮未重复执行全量单元或 Rust 测试。日志：`artifacts/acp-ai/activity-actions-browser.log`、`activity-actions-typecheck.log`、`activity-actions-lint.log`、`activity-actions-build.log`；截图已查看并保存在 `artifacts/acp-ai/activity-actions-ui/`。

## 当前文档标签位置调整

当前文档和未命名正文的自动上下文标签移到输入框外部上方，左侧对齐并保留 8px 间距。附件仍在框内顶部，`@` 提及仍在正文中；上下文移除行为保持一致。本轮仅调整布局，Chromium/WebKit 浅深主题、独立文档、附件、IME 共 10 项相关回归通过，类型检查与 lint 通过；ARM64 开发 app/DMG 已重新构建（未签名）。未重复执行上轮全量单元或 Rust 测试。

日志：`artifacts/acp-ai/context-position-browser.log`、`context-position-typecheck.log`、`context-position-lint.log`、`context-position-build.log`。截图：`artifacts/acp-ai/context-position-ui/`。

## 富文本输入、附件与每轮处理过程

- 输入区采用驻留 contenteditable；`@` 文档显示为可导航链接，保留原生撤销、IME、键盘选择和换行。提及不再重复显示上方标签，删除同步移除上下文；当前文档自动引用与显式提及分别跟踪，切换文档不会丢失显式引用。
- 支持文件选择、粘贴和拖放，输入区顶部为横向滚动附件栏，移除按钮在悬停/聚焦时显示。图片和纯文本可预览，HTML 不执行；发送后的图片、文件和独立上下文在文字气泡之外。去掉冗余身份标签，悬停消息提供复制与时间；等待期间可继续起草，停止与连接中有各自按钮状态。
- ACP 实际思考、计划、工具事件按轮归组，运行时展开，结束后折叠为“用时…”细线摘要。最终回答与状态通知独立；历史重开默认折叠，旧历史没有结束时间时不伪造耗时。计划完成更新保持原位置，避免把最终回答错误归入过程。
- 每轮最多 8 个附件、总量 4 MiB；图片受格式/像素限制和 ACP image 能力约束，二进制资源受 embeddedContext 能力约束，文本可降级为命名文本块。能力不支持、超限或迟到的粘贴不会吞掉既有草稿。副本在发送时保存，历史只记录元数据；读取验证归属/摘要，原始本地文件不变，删除会话清除附件副本。

实际验证：

- `pnpm check`：120 文件、1505 项测试通过，类型与依赖边界通过；AI 相关 7 文件、27 项测试通过。`pnpm lint`：686 文件通过。
- Chromium/WebKit 共 90 个不同浏览器用例通过。主体运行 84 项通过、4 项新增耗时断言因 `innerText`/`textContent` 换行差异失败；修正测试断言后过程与删除专项 6 项通过。最后引用归属/IME/删除专项 8 项通过（其中 2 项新用例，其余为重跑），不重复累计。
- Rust 宿主库 538 项通过、4 项既有 ignored；fmt 与 clippy `-D warnings` 通过。覆盖附件字节、损坏图片、伪造引用、会话归属、删除墓碑、目录符号链接、原文件替换与目录拒绝等合成文件场景。
- 浅深主题截图已查看，输入框、独立附件消息、过程展开/收起分别保存。浏览器 IPC/剪贴板替身与真实系统剪贴板、在线模型能力严格区分；本轮没有发送真实用户图片/文档、读取用户密钥或重启现有应用。

macOS ARM64 开发 app 与 DMG 已重新构建（未签名），构建日志：`artifacts/acp-ai/rich-composer-build-final.log`。未安装或重启用户正在运行的应用。

日志：`artifacts/acp-ai/rich-composer-check-final.log`、`rich-composer-lint-final.log`、`rich-composer-unit-final.log`、`rich-composer-browser-final.log`、`rich-composer-activity-final.log`、`rich-composer-reference-final.log`、`rich-composer-rust-full.log`、`rich-composer-clippy.log`、`rich-composer-fmt-final.log`。截图：`artifacts/acp-ai/rich-composer-ui/`。

## 环境变量下划线渲染修复

共享 Markdown 解析器补齐下划线强调的词内边界：环境变量、snake_case、连续下划线、Unicode 标识符不再被截成斜体；正常 `_AI_`、`__bold__`、代码及链接仍可显示。跳过不能闭合的词内候选，保留 UTF-16 坐标与原文；缓存闭合候选搜索，防止大量未闭合下划线引入重复扫描。未读取或更改用户凭据，未发起真实模型请求。

先加入回归重现（32 项中 15 项失败），修复后最终 33 项定向测试通过；完整 `pnpm check` 118 文件、1497 项测试通过，包含源字节与坐标保持及长文本回归。Chromium/WebKit 浅深主题 4 项浏览器测试通过：合成流式错误消息完整显示 `Z_AI_API_KEY`，文本选择保留原名，正常斜体/粗体、行内代码和带下划线的文档链接保持正确。截图已人工查看，保存在 `artifacts/acp-ai/underscore-ui/`。类型、依赖边界与 679 文件 lint 通过；原生 UI/在线模型未重新验收。

日志：`artifacts/acp-ai/underscore-regression-before.log`、`underscore-unit.log`、`underscore-check-final.log`、`underscore-lint-final.log`、`underscore-browser-final.log`。

## 输入区焦点与配置自适应

输入框移除蓝色外轮廓和光晕，聚焦只轻微加深中性色单线边框；其他控件保留键盘焦点提示。底部静态“内置文档工具写入需确认”文案已删除；真实批准流程未改动，上下文用量在有数据时仍可显示。模型等选项隐藏可见标签，保留 aria-label 和含完整当前值的 title。使用选中值测量宽度、统一箭头预留，去掉固定单项上限，常见三项在 280px 面板中可完整排成一行，拉宽后较长模型名能超过原 160px 上限而完整显示。多配置或极长值按实际可用空间换行/省略，不产生横向溢出。

12 项既有发送前配置、认证、草稿/IME 和新建菜单用例通过；最终 4 项浅深主题 × Chromium/WebKit 专项复测通过，覆盖中性焦点、静态提示移除、280px 单行完整值、宽面板长值、极长值边界及六项配置换行。针对 WebKit 原生按钮 Tab 偏好，测试显式聚焦上下文按钮验证焦点样式；控件改为统一箭头占位，选项标签约束溢出以处理 WebKit 长值几何差异。类型检查和 679 文件 lint 通过。

日志：`artifacts/acp-ai/composer-polish-browser-final.log`（12 基础用例通过，2 个专项 WebKit 溢出问题随后修复）、`composer-polish-adaptive-final.log`（最终 4 项通过）、`composer-polish-typecheck.log`、`composer-polish-lint.log`；截图：`artifacts/acp-ai/composer-polish-ui/`。本轮未新增原生 UI/在线模型验收。

## 第三栏独立实线圆角框

目录和 AI 共用浅色实线圆角框，移除触顶的拖动竖线；原生覆盖式标题栏下方预留 32px，普通/全屏布局预留 6px，底部保留 6px。会话历史和智能体设置按钮补齐同风格细边框。边框包含在既有宽度内，维持正文分栏、滚动条位置和拖动范围。

按用户最新要求采用实线。初轮 76 项运行期间从虚线改为实线，72 项通过、4 项旧虚线期望失败；更新期望后，最终 20 项相关用例全部通过，覆盖 Chromium/WebKit 浅深主题、目录/AI、菜单、宽度拖动、展开收起、全屏切换、正文实例与保存字节保持。类型检查、679 文件 lint 通过，macOS ARM64 开发 app/DMG 已重新生成。没有新增真实宿主 UI 或在线模型验收。

日志：`artifacts/acp-ai/pane-frame-browser-final.log`、`pane-frame-typecheck.log`、`pane-frame-lint.log`、`pane-frame-build.log`；截图：`artifacts/acp-ai/pane-frame-ui/`。

## 菜单视觉细化

新建会话控件补充细边框与通用 AI 图标，右侧箭头改用居中的 SVG 并增加短竖线分隔；菜单和按钮等宽、左边缘一致，向下展开间距 2px。菜单收紧内边距与行距，减弱浮层阴影，管理入口改为加号。Chromium / WebKit 浅深主题、窄面板、工具栏避让与菜单键盘操作共 10 项回归通过；尺寸比较在同一帧读取，避免侧栏动画导致分次测量误差。类型检查及 679 文件 lint 通过。本轮为前端样式与图标调整，未重跑原生或在线模型验收。

日志：`artifacts/acp-ai/session-menu-compact-browser-final.log`、`session-menu-compact-typecheck.log`、`session-menu-compact-lint.log`；截图：`artifacts/acp-ai/session-menu-compact-ui/`。

## 新建会话菜单与发送前配置

顶部「新建会话」下拉菜单展示已安装智能体，停用项禁选，保留管理入口。选择智能体才创建并初始化会话；展开菜单、Escape 关闭或进入设置不会清空当前草稿。原独立智能体选择器移除，当前会话通过只读名称与图标标明所属智能体。菜单支持方向键、Home/End、Tab、Escape、外部点击和焦点恢复，并验证浅深主题及 700px 窗口下的边界。

模型、思考深度、权限模式按 ACP 初始化后的实际返回展示，发送前即可修改；配置选项优先于旧 `modes`。准备期间可编辑草稿；认证与连接失败提前反馈，提供重试。迟到连接被释放，选定其他智能体不会接收旧会话选项。输入区上方分隔线已移除。仅准备会话不发送 prompt、文档正文快照/上下文，不写入空历史；停用的空会话会释放。

本轮前端与状态机测试使用 IPC 替身，未新增真实 GLM 账号或在线模型验收。下表 Rust、钥匙串、真实模型结果为此前轮次证据；本轮未修改 Rust。菜单首次测试误将被浮层覆盖的会话标识作为外部点击目标，已改为点击空白区标题；WebKit 的 Tab 退出焦点差异已在实现中修复，6 项专项复测全部通过。浏览器截图保存在 `artifacts/acp-ai/session-menu-ui/`。

## 已交付的行为

- 标题栏 AI 入口；复用目录侧栏的收展、布局和可调整宽度，保持编辑器实例与对话连续性。
- 设置中的 11 种智能体目录、安装、使用本机程序、卸载、启用/停用、凭据管理与安装进度/取消。下载采用环境或系统代理，不关闭 TLS 验证。
- 当前文档自动上下文、可移除标签、`@` 文件检索、未保存正文快照、没有文件夹时的 AI 草稿工作区；独立打开文件的单文件读写授权。
- 流式问答、模式/配置选项、工具活动、计划、批准、停止和断线处理。晚到的旧连接批准不能在新会话中执行操作。
- 内置 MCP 文档列表、读取、写入、唯一片段精确修改、创建目录、可恢复删除和恢复；保存前检查磁盘版本、保留编码与 BOM，并复用外部变更检测。
- 文档链接导航（包含空格、括号、URL 保留字符），历史查看、重命名、归档、恢复归档和永久移除本地记录；拒绝损坏历史数据及延迟写入复活。

设计依据、权限边界和文件布局见 [AI-ACP.md](AI-ACP.md)。

## 分层验证

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| TypeScript 类型与依赖边界 | 通过 | `artifacts/acp-ai/typecheck.log`、`boundaries.log`、全量 check 日志前段 |
| TypeScript 全量检查与测试 | `pnpm check` 通过；118 个测试文件、1497 项测试通过 | `artifacts/acp-ai/underscore-check-final.log` |
| 全量 lint | `pnpm lint` 通过；检查 679 个文件 | `artifacts/acp-ai/underscore-lint-final.log` |
| AI TypeScript 单元测试 | 19 项通过，包含在全量 check 中 | `artifacts/acp-ai/underscore-check-final.log` |
| Chromium / WebKit AI 界面测试 | 本轮 44 项基础/发送前配置用例通过，6 项新建菜单专项复测通过（合计 50 项唯一用例） | `artifacts/acp-ai/session-menu-browser-final.log`、`session-menu-interaction-final.log` |
| Markdown / 聊天下划线专项 | 33 项定向单元测试、4 项浏览器回归通过 | `artifacts/acp-ai/underscore-unit.log`、`underscore-browser-final.log` |
| ACP 会话状态机 | 8 项通过：连接准备与去重、配置回写、取消迟到连接、无恢复能力的空会话重建等 | `artifacts/acp-ai/preflight-unit-final.log`，并纳入本轮全量 check |
| 普通设置页与凭据弹窗 | 前轮普通设置页 24 项、凭据焦点复测 8 项通过；本轮 AI 套件继续覆盖凭据弹窗 | `artifacts/acp-ai/credentials-browser-complete.log`、`credentials-dialog-final.log` |
| 共享目录/AI 侧栏布局回归 | 最终 20 项相关用例通过，包含全屏、拖动与正文保持 | `artifacts/acp-ai/pane-frame-browser-final.log` |
| Rust AI 单元测试 | 包含在本轮全量 Rust 测试中；钥匙串另行显式运行 | `artifacts/acp-ai/credentials-rust-final.log` |
| Rust 全量单元测试 | 534 项通过、4 项显式忽略；本轮另行执行 2 项钥匙串测试 | `artifacts/acp-ai/credentials-rust-final.log` |
| Rust fmt / Clippy（warnings as errors） | 通过 | `artifacts/acp-ai/credentials-fmt-final.log`、`credentials-clippy-final.log` |
| 原生标题栏布局单元测试 | 不同统计文字宽度下的图标列位置通过 | `artifacts/acp-ai/ui-align-rust-unit.log` |
| 原生 AppKit / ACP / MCP / PTY | 包含真实凭据环境变量注入、连接撤销与删除后重连，全部通过 | `artifacts/acp-ai/credentials-native-complete.log` |
| macOS 系统钥匙串 | 2 项独立合成条目的写入/删除、失败回滚、写入后报错补偿及卸载清理通过；没有读取用户凭据 | `artifacts/acp-ai/credentials-keychain-final.log` |
| 真实模型 | 本机 OpenCode 1.19.3 的文本回合与内置 MCP 文档修改通过 | `artifacts/acp-ai/native-model-test-final.log` |
| 桌面构建 | 包含环境变量下划线渲染修复的 macOS ARM64 开发版 app / dmg 生成成功，未签名 | `artifacts/acp-ai/underscore-build-final.log` |

界面测试覆盖浅色/深色、700/960/1440 宽度、当前上下文移除、`@`、文档跳转、历史操作、设置启停、IME Enter、写入预览/取消、隐藏后恢复对话和连接失败保留输入。它们使用真实 Shell、私有编辑器运行资源和浏览器引擎，但文件/进程 IPC 为测试替身，不能冒充系统 WebView 的完整人工验收。

原生测试使用独立隐藏窗口、临时目录和真实子进程，验证了生产 AppKit 图标的图形、几何及点击派发；真实 stdio、Tauri 窗口归属校验、MCP 代理与批准回应；文件读写、精确替换、目录创建/删除/恢复、取消拒绝和原生 watcher 通知。当前文档单文件能力在工作区之外读取/修改合法文件，关闭授权后拒绝继续修改。

真实模型测试通过生产 Rust ACP / MCP 通道连接本机 OpenCode，仅使用临时生成的样例。第一轮验证纯文本回复；第二轮使用内置文档工具修改指定样例，批准器只接受该样例的明确修改，并逐字节核对 UTF-8 BOM、CRLF 与其余内容。没有向模型发送仓库正文或用户文稿。

## 真实发行包安装与初始化

以下版本均在临时安装目录完成下载、安装和 ACP v1 初始化。安装探针使用隔离 home，不使用用户登录态，也不发送模型 prompt。安装验证结束后临时目录清理，不会把 11 个程序全部预装到用户的正常应用配置。

| 智能体 | 验证版本 | 安装与握手 |
| --- | --- | --- |
| Claude Agent | 0.86.0 | 通过 |
| CodeBuddy Code | 2.161.4 | 通过 |
| Codex | 2.1.1 | 通过 |
| Cursor | 2026.10.01 | 通过 |
| GitHub Copilot | 1.0.92 | 通过 |
| GLM Agent | 1.14.0 | 通过 |
| Grok Build | 1.0.50 | 通过 |
| Kimi CLI | 1.52.0 | 通过 |
| MiniMax Code | 0.2.7 | 通过 |
| OpenCode | 1.18.35 | 通过 |
| Qoder CLI | 0.2.14 | 通过 |

证据：`artifacts/acp-ai/install-probes.json`、`install-probes-remaining.json`。真实对话使用本机已有 OpenCode 1.19.3，与发行包安装探针的 1.18.35 分别记录。

## 工程基线修正

用户明确授权后，已为 `apps/desktop/test/runtime-preferences-policy.test.ts` 补上遗漏的 `noHintForOpenLink: false` 测试期望，没有改动运行时代码。该文件 8 项测试通过；随后执行 `pnpm check`，类型检查、依赖边界和全部 1474 项测试通过。

用户随后明确授权修正 `apps/desktop/src/features/settings/test/theme-ack.browser.mjs:70` 的数组映射格式。此次仅调整换行，未改变测试逻辑。

最终重新执行 `pnpm check`、`pnpm lint` 和 `git diff --check`，均通过。全量测试为 118 个文件、1474 项通过；lint 检查 678 个文件。证据为 `artifacts/acp-ai/check-complete.log` 和 `artifacts/acp-ai/lint-complete.log`，此前失败日志保留作追溯。

两项基线修正均已获得明确授权，没有剩余的修复确认。它们仅涉及测试文件，不影响生产构建；后续侧栏界面改动的构建见下节。

## 侧栏界面打磨（2026-10-19）

- 没有已启用智能体时显示中性 AI 图标；选择器包含“管理智能体…”入口，打开设置不会切换智能体、断开会话或清空输入。
- 移除冗余标题与关闭按钮，保留新建、历史、设置三个操作，统一为 16px SVG 和 28px 按钮。按钮在面板内部右对齐，距窗口右缘至少 28px，留出 20px 编辑器滚动条区域及 8px 间距。macOS 原生标题栏同步采用相同的 32px 列间距，三列中心分别距窗口右缘 106 / 74 / 42px；字数统计随之避让，源代码模式的原有标签位置保持不变。侧栏恢复与目录一致的宽度和外部留白计算，取消此前延伸进滚动条区域的顶部布局及额外拖动宽度补偿。
- 无文件夹、未启用智能体时，整个提示组仍位于可用空间中央，内部采用左对齐的紧凑布局：14px 状态标题与文字操作入口同排，以固定 12px 间距相邻排列，取消两端分散对齐；标题与下方用途说明共用左边缘，移除独立装饰图标和实心主按钮。新会话保留一句引导与同排的三个简短文字操作。内容组最大宽度 280px，随窄侧栏收缩；低高度下可以滚动。
- 长文件夹名称截断并保留完整路径提示，不挤压智能体选择器。收起 AI 面板后将输入焦点交还编辑器。

最新原生对齐调整后的浏览器回归为 42 项（16 项 AI、26 项目录侧栏），在 Chromium / WebKit 中通过。针对本次重叠问题，使用长文档并强制显示真实浏览器滚动条，验证 700×500、960×720、1440×900、宽侧栏、浅色和深色状态：按钮完整位于滚动条区域之外、各按钮中心可命中、窗口边缘仍由编辑器滚动条接收鼠标事件，并实际拖动滚动条后继续点击设置。另验证了提示标题与操作同排、管理入口的键盘 Enter、设置往返后的会话/草稿保留、共享侧栏的动画/滚动/输入法和编辑器节点保留。

前一阶段微调小字对比度后，针对空状态和设置往返运行 6 项 Chromium / WebKit 用例，全部通过；日志为 `artifacts/acp-ai/ui-refine-appearance-final.log`。最终截图位于 `artifacts/acp-ai/ui-align/`。浏览器中的 Shell 与编辑器使用真实资源，原生 IPC 使用测试替身。另通过原生独立隐藏窗口直接量取三个 AppKit 按钮相对窗口右缘的坐标，并验证 AI 按钮点击派发；原生 MCP / PTY / ACP 回归也再次通过。该原生坐标验证与浏览器界面验证分别记录，没有冒充整个系统 WebView 的人工视觉验收。

`pnpm check` 的类型、依赖边界与 1474 项测试全部通过，`pnpm lint` 通过。最新 `pnpm build:desktop --debug` 成功生成包含空状态间距和原生图标对齐改动的 macOS ARM64 app / dmg。此前两轮界面验证的日志和截图保留在 `ui-polish-*` 等文件中；本节与上表记录当前实现的验证结果。

## Copilot / Grok 图标修复（2026-10-19）

这两个本地图标的 SVG 路径使用白色填充，而共用的 `AgentIcon` 在浅色与深色主题中均保留白色底板，导致资源加载成功但图案不可见。仅将两份 SVG 的单色填充改为 #111，保留原始路径、尺寸、品牌名称和许可；图标清单记录原始 SHA-256、适配说明及新 SHA-256，许可通知同步更新。

新增浏览器回归通过真实设置组件加载两份资源，将图标绘制到白色画布并检查可见深色像素。修复前的 4 个 Chromium / WebKit、浅色 / 深色用例均因零可见像素失败；修复后 4 个用例通过，且每个用例都检查 Copilot 与 Grok 两个图标。日志为 `artifacts/acp-ai/icon-regression-before.log` 和 `icon-regression-after.log`，截图保存在 `artifacts/acp-ai/icon-fix/`。资源身份与许可测试、类型检查及 lint 通过；macOS ARM64 开发版 app / dmg 已重新构建，并核对构建输出中的两份 SVG 与源文件一致。本轮没有变更 Rust 或布局逻辑。

## 按钮交互态与菜单名称（2026-10-19）

安装按钮的白色文字依赖蓝色实底，但后加载的全局 `button:hover:not(:disabled)` 与原实色按钮规则具有相同优先级，悬停时会用浅色背景覆盖蓝底。为实色按钮增加明确的 hover / active 规则，并让通用 AI hover 排除禁用按钮。安装与工具批准按钮保持蓝色实底，悬停/按下逐级加深；发送与停止按钮保持前景/背景配对，禁用状态不随悬停变色。设置导航文字、无障碍名称、页面标题和区域名称统一使用“智能体”或“智能体设置”。

新增回归从实际计算样式取色、在画布上合成透明背景并计算对比度，验证安装、批准、发送和停止按钮在浅色/深色主题的默认、hover、active 状态均达到至少 4.5:1；检查禁用发送按钮 hover 不变色、次要按钮可读，以及悬停/按下检查没有触发安装、发送或批准。完整 AI 浏览器集 26 项在 Chromium / WebKit 中通过，含菜单导航、历史、上下文和品牌图标回归。截图位于 `artifacts/acp-ai/button-states/`。

设置页采用单独构建的隔离运行资源；修改导航文本后已重新执行 `pnpm prepare:runtime` 并验证实际 iframe 的新标签。首次检查发现的旧标签来自尚未重新生成的资源，重新生成后通过。全量 `pnpm check`（类型、依赖边界、1474 项单测）与 lint 通过。本轮没有变更原生宿主、目录布局或文件权限。macOS ARM64 开发版 app / dmg 已重新生成，包含新的按钮状态与“智能体”菜单名称。

## 设置页面视觉与导航一致性（2026-10-19）

智能体导航原先单独注入缩窄宽度，且使用未重置外观的原生按钮，导致默认背景、hover 深度与普通设置导航不同。现统一导航的宽度、内边距、字体、图标槽位和默认透明背景，按有效 `aria-current` 控制选中样式：智能体页选中时不会同时将旧分类显示为选中；回到文件、Markdown、搜索或重新进入设置后不会残留智能体高亮。键盘焦点保留统一描边，不冒充选中背景。智能体页展示时，原设置内容隐藏，避免焦点进入覆盖层下的控件；旧独立设置窗口保留兼容处理。

新增共享设置样式参数，供隔离设置页和可信宿主的智能体页面共同使用，统一亮/暗颜色、字体、760px 内容上限及 900px / 800px 响应式内边距。两侧对称保留滚动条空间，避免长短页面切换时偏移。智能体页的标题、说明、搜索控件、按钮、开关和分组边框对齐既有设置样式；原先铺满窗口的独立卡片改为紧凑分组列表。搜索无结果时提供明确提示。安装与权限处理仍由原宿主执行，隔离页仍只发送导航布尔值。

回归比较导航正常/hover/选中状态的实际样式与宽高，验证默认文件页、分类切换、键盘 Enter、搜索及退出重开；在 1440、1280、900、700 宽度下逐项比较 Markdown 页与智能体页的内容位置、宽度、标题字体、说明颜色和圆角边框，并检查无横向溢出。此前的按钮对比度、品牌图标、会话和上下文回归一并通过。共 64 项 Chromium / WebKit 测试通过，`pnpm check` 的类型、依赖边界及 1474 项单测通过，lint 检查 676 个文件通过。旧窗口用例的菜单项数量同步为新增“智能体”后的 8 项。最终截图位于 `artifacts/acp-ai/settings-consistency/`，包含默认文件页中智能体未选中的预览。macOS ARM64 开发版 app / dmg 已成功重建，包含本轮统一后的设置页面。

## 已安装操作与凭据管理（2026-10-19）

已安装的单配置智能体将状态、凭据、卸载操作与名称放在同一行，顺序为“启用状态 → 凭据 → 卸载”，安装来源与版本收纳在名称下方；多配置与窄窗口保留清晰的分行布局。凭据与卸载确认使用窗口居中的模态框，宽度上限 480px，高度不足时只滚动内容区。支持原生 dialog 及 API 缺失时的兼容路径，背景不可操作、Tab 不离开弹窗、Esc 只关闭弹窗；提交期间阻止误关闭，退出后焦点回到打开按钮。

凭据列表只显示变量名及固定掩码，支持替换和二次确认删除；保存/删除后读取宿主最新列表，失败时保留窗口并说明原因。提交、关闭和切换编辑对象都会清空密码输入。新增变量名保留大小写，校验字母/下划线开头、80 字符上限；拒绝空值、NUL 和超过 16 KiB 的值。旧版本允许的数字开头名称仍可删除。

宿主统一从系统凭据存储构造 ACP 与 PTY 环境变量，显式凭据覆盖启动默认值。连接/登录启动与配置操作串行，发生冲突时快速返回重试提示；成功变更凭据后撤销相关连接与登录终端。配置更新保留宿主权威的凭据引用，避免旧 UI 快照复活删除项；同名普通环境值被清除，避免删除后回退到旧值。存储/元数据失败有补偿恢复，连同“配置已经写入后才报错”的场景一起验证。卸载在移除配置前删除凭据；失败恢复凭据与配置，保留重试入口，不把部分完成当作成功。

实际运行的 `MARKLYRA_ACP_CREDENTIAL_PROBE=1 cargo test -p marklyra-desktop --test agent-native` 使用唯一临时条目和临时 Node ACP 程序，验证带空格、符号及 Unicode 的合成值能以原始小写变量名进入真实 ACP 及 PTY 进程；删除后钥匙串返回 NoEntry、配置不再含引用、旧连接不可使用，新子进程不再收到该变量。没有读取用户密钥或用真实账号向模型服务发请求。另行运行的两项系统钥匙串测试验证替换/新建/删除失败补偿和卸载多条凭据的回滚与清理。

浏览器检查包括 1440×900、900×640、700×500 几何位置，亮/暗主题，长变量名换行，保存/删除失败重试，提交期间 Esc、防止背景焦点、关闭清空输入及未向 localStorage/sessionStorage 写入明文。`credentials-dialog-final.log` 的 8 项同时覆盖原生与模拟 API 缺失的兼容路径；这不等同于旧系统实机验收。截图位于 `artifacts/acp-ai/credentials-ui/`。最终 macOS ARM64 app / dmg 已重新构建，包含本轮界面、凭据事务与进程环境变更。

删除清理的是 MarkLyra 保存的系统凭据条目、配置引用及其控制的旧连接；不替服务商撤销密钥，也不删除外部智能体自行保存的账号配置，不宣称对系统备份等外部副本做物理擦除。

## 实测边界与交付物

Windows、macOS Intel 以及其余智能体的真实账号对话未在本机验收。PTY 流程使用原生合成登录程序验证；真实账号侧仅验证了本机已有 OpenCode 登录配置。没有专门执行长时间运行、启动性能或多进程压力基准。Vite 的 chunk-size 提示不影响构建成功。

ACP 不是系统沙箱；第三方智能体可能有自己的权限和文件工具。内置文件工具的批准、目录能力和版本检查不等于对外部进程的系统级限制。恢复目录中的文稿会保留，当前会话可使用恢复凭证，进程结束后仍可从工作区 `.marklyra-ai-trash` 找回内容。永久移除会话只处理 MarkLyra 本地记录，不删除文稿或替外部智能体管理其原生历史。

开发交付物：

- `target/aarch64-apple-darwin/debug/bundle/macos/MarkLyra.app`
- `target/aarch64-apple-darwin/debug/bundle/dmg/MarkLyra_0.1.0_aarch64.dmg`

证据目录 `artifacts/acp-ai/` 与构建产物均被 Git 忽略。源码没有提交、推送或发布，也没有替换已有应用实例或修改系统文件关联。

## 2026-10-24：待授权提醒

实现 Windows 任务栏短暂闪烁、macOS 信息级 Dock 跳动、应用内待处理标记和持久化开关。原生接收路径和 Shell 交互队列共用去重状态；提醒只关联经过验证的活动连接与未结束请求，不改变 ACP 的授权选项、响应或执行权限。

- 前端单元测试：1836 项通过；类型、改动文件 Biome、桌面前端构建通过。
- Rust：fmt、Clippy 通过，无新增告警；workspace 串行测试 893 项通过、5 项按既有配置忽略。
- macOS 原生 `agent-native` 夹具通过：窗口归属、伪造请求过滤、重复请求、不改变焦点、停止及过期请求清理；原有 ACP/MCP、文档 CAS、BOM/CRLF、PTY 登录与 watcher 测试同时通过。此为原生 API/状态验证，不把它扩大为 Windows 实机动画验收。
- Chromium/WebKit 完整 AI 面板及文档侧栏回归：140 项通过、零失败。此前 4 项工具栏测试在 HEAD 对照中同样失败，诊断确认断言仍假定旧版窗口边缘滚动条与工具栏固定偏移。现在等待面板动画结束，按真实 AI 面板边界检查按钮尺寸、排列及多点点击命中，在文档栏实际滚动条位置执行拖动；覆盖两种标题栏、亮暗主题和 700/960/1440px 窗口。实际布局无需修改。
- 提醒、开关及写入授权专项：10 项通过，覆盖焦点、收起面板、请求归属、重复到达、拒绝、断连、开关重载和原有取消流程；随后纳入上述完整回归。
- 原生请求清理回归先在旧实现失败：普通 ACP 完成会发出额外撤回事件。修正为仅 MCP 超时/失败发出撤回通知，普通 ACP 响应由原会话队列清理，防止提供方复用 JSON-RPC ID 时晚到的事件误清新请求。原生夹具同时检查正常完成无撤回事件及超时事件的连接/请求身份。
- Windows 原生代码已实现，但当前主机没有 Windows 运行环境，尚未进行 Windows 安装版的闪烁及系统设置兼容验收。

本机证据保存在忽略目录 `artifacts/agent-attention/`，包括 `check-final.log`、`clippy-submit.log`、`rust-submit.log`、`native-submit.log`、`browser-submit.log`、`browser-baseline.log`、`layout-fixed.log`、`reused-id-before.log` 和 `browser-final-targeted.log`。对照服务仅在内存中加载 HEAD 文件，不覆盖工作区改动。
