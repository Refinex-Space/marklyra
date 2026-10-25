# MarkLyra 原生源码迁移与验收

日期：2026-10-25。产品版本保持 `0.1.8`，基线为 `0f15875`，工作分支为 `refinex/new-feature`。本次仅完成本地修改、检查与构建，没有提交、推送或发布。

## 源码与构建

原先单独存放的核心输入已归入所属包和应用，根旧资源目录已删除。输入清单从 355 项收敛为 71 项；实际运行页包含 469 个文件。

| 内容 | 现在的维护位置 |
| --- | --- |
| 编辑器程序、worker、数据 | `packages/editor-runtime/src/engine/` |
| 编辑器页面与内联模板 | `packages/editor-runtime/src/page/` |
| 编辑器样式、图标字体、简中和英文词典 | `packages/editor-runtime/assets/` |
| 保持既有版本的随附库 | `packages/editor-runtime/vendor/` |
| 内置主题、共享排版及实际使用的主题字体 | `packages/editor-themes/` |
| 设置页源码 | `apps/desktop/src/features/settings/runtime-preferences/page/` |
| 原生标题栏图像 | `apps/desktop/src-tauri/icons/titlebar/` |

现有序列化、补全、焦点、表格、HTML 与渲染生命周期、排版队列修正，以及设置页适配和图表样式隔离，已固化进内部源码。原构建期按历史文件摘要和字符偏移打补丁的转换器已删除；行为回归直接解析和执行当前源码。

内核保留现有 JavaScript 表示形式，没有同时重写编辑算法或升级依赖。`pnpm-lock.yaml`、`Cargo.lock` 未改变。输入清单使用稳定项目标识，产品版本由根配置读取，设置页关于信息随构建注入，正常版本递增不会使未变的输入身份失效。

`pnpm prepare:runtime` 生成 `packages/editor-runtime/dist/page/`，桌面打包将其映射到安装包内的运行目录。编辑器仍保持独立 origin、类型化消息、受限原生能力及原有文件访问边界。构建和运行均不需要另一个已安装应用或私有资源目录。

## 清理与兼容

- 清除历史产品名称、版本说明和专用缩写前缀，统一为 MarkLyra／marklyra。文件名、字体内部名称、CSS、DOM、代码和测试共同更新。
- 删除 27 项旧应用、安装器、文档和磁贴身份图像，沿用现有 M 图标。
- 只保留 `Base.lproj` 与 `zh-Hans.lproj`；其他 37 个语言目录移除，非法或退役语言值回退到受支持语言。
- 删除 18 项退役主题字体。保留当前侧栏使用的 Raleway 两个子集，以及内置主题使用的 Open Sans 四个字重／斜体文件，字节保持不变。
- 删除退役主题光标、无引用旧界面样式和图片、字体演示文件、旧调试模板与说明；仍有加载或回退引用的资产保留。
- 移除旧遥测初始化、远程配置、位置查询及其唯一使用的 SDK 文件。保留本地错误提示、日志和校验；原有七个本地诊断方法逐字节保持。
- 图片字段采用当前命名，并兼容单一历史命名空间；当前字段优先，歧义拒绝，不改写用户文稿。
- 主题兼容有限的命名空间编辑器角色。只适配已核验 stylesheet 快照的选择器，保留原文件、声明、URL、特异性及否定语义。
- 富文本剪贴板保留普通及自定义 URI 数据，继续拒绝可执行代码和当前私有能力 URI。导航与图片访问仍由各自宿主边界独立校验，不因粘贴执行链接。

真实依赖摘要、颜色和数学字体数据中的偶然数字子串不属于产品版本说明，未进行破坏性的全字节替换。Git 历史未重写。

## 构建完整性

当前输入身份及安全边界由构建脚本校验。项目许可和必要第三方通知仅维护根 `LICENSE` 与 `THIRD-PARTY-NOTICES.txt`，以根 README 为准。以下为内化迁移阶段的历史测试记录，通知整理后的生成文件数量会减少。

## 实际验证结果

| 检查 | 结果与范围 |
| --- | --- |
| `pnpm check` | 通过：类型、包边界、原生输入语法及 148 文件中的 1,897 项单元测试。 |
| Node 脚本回归 | 通过：27 文件、180 项；包含源码行为、构建边界、清单、通知、资源供应及归档检查。 |
| 原生输入语法 | 通过：17 JavaScript、15 CSS、10 JSON、12 段 HTML 内联脚本。 |
| Rust | 全工作区 fmt、clippy all-targets 且 `-D warnings` 通过；1,064 项测试通过，5 项既有 ignored。 |
| AppKit | 隔离、未显示窗口中的标题布局、真实命中测试、重命名 action 与原有 proxy 状态通过。 |
| 编辑器完整浏览器套件 | Chromium／WebKit：2,421 通过，2 项声明的预期失败，1 跳过；零非预期失败。 |
| 桌面完整浏览器套件 | 1,402 通过、64 非预期失败；全部已取得迁移前 HEAD 对照证据，详见下一节。 |
| 最终差异补验 | 编辑器 253 通过、1 WebKit PDF 跳过；设置／偏好 34 通过；最后 stylesheet 竞态与主题补验 4 通过。 |
| 来源与归档 | 71 输入、74 原生输出映射、469 运行文件和 386 份集中通知核对通过；7 个真实 SDK 归档通过。 |
| 干净源码构建 | 全新目录起初无依赖、产物、私有目录及旧资源目录；离线冻结安装、构建和语法检查通过，16 条工作区依赖链接均位于新检出，源码未漂移。 |
| macOS 本地包 | ARM64／Intel 标准 debug 构建均生成 app 与 DMG；架构、版本 0.1.8、名称、M 图标核对通过。未签名、未发布。 |

干净检出、主工作区及两种架构 app 内的 469 个运行文件，文件集合和逐文件 SHA 完全相同，树摘要为 `239073397d4d5614faf3130a10b0f572affc48174635ccbffdecbb987e873fbd`。

完整浏览器套件使用独立快照和端口，未复用其他检出的已有服务。后续 URI 保真、旧遥测关闭、主题兼容和 stylesheet 竞态修正分别由最终差异补验覆盖；没有将早先快照的结果冒称为最后差异已运行。

## 已有失败与未执行范围

桌面套件 64 项失败包含 60 项跨浏览器共享失败、1 项 WebKit 导出键盘焦点失败，以及 3 项时序波动。前两类在初始 HEAD 的对应浏览器均复现。主题切换的原 50ms 门槛在 HEAD 与当前均出现通过／失败波动；双 iframe 定位问题在 HEAD 原测试重复 8 次时出现 1 次相同失败。没有修改断言、超时或门槛，也没有扩大范围修复这些旧问题。

全仓维护代码 Biome 检查保留 16 项既有诊断，来自本次未修改的 SVG 和导出／测试文件；用原始 HEAD 文件及原始配置复现了完全相同的诊断。本次修改文件在该检查中没有新增诊断。迁移前不在 Biome 范围内的原始引擎与随附输入继续保留现有表示形式，单独纳入语法、完整性与行为验证，未将它们称为 Biome 零问题。

Windows 原生编译、WebView2 真机、系统输入法、安装升级和完整系统剪贴板验收未执行；浏览器宿主替身不代表这些结果。Codacy CLI／对应 skill 在本机不可用，未运行 Codacy，也未初始化、上传或修改其配置。

## 复核入口

- 构建与维护说明：`docs/RUNTIME-SOURCE-VERIFICATION.md`。
- 输入及来源：`config/runtime-source.json`、`artifacts/source-audit.json`、`artifacts/runtime-audit.json`。
- 完整浏览器分类：`artifacts/internalization-validation/browser-full-summary.json`。
- 基线对照：`baseline-comparison.json`、`baseline-expanded-comparison.json`、`baseline-webkit-comparison.json`、`theme-idle-comparison.json`。
- 最终构建：`final-native-builds.json`、`final-clean-source.json`。
- 最新 Node／TypeScript：`final-node-tests.log`、`final-check.log`；静态诊断为 `final-biome.json`。
- SDK 归档：`artifacts/npm/pack-report.json`。

上述未写目录前缀的报告均位于 `artifacts/internalization-validation/`，该目录不进入 Git。原始对照副本已移到仓库外的临时证据目录；保留测试证据，不让旧输入继续作为项目源码或构建依赖存在。
