# WebKit 大文档粘贴与异步编辑加固

日期：2026-10-24。起点：`61116d7`。本轮使用当前项目的锁文件、受版本控制的运行资源、独立浏览器和合成文稿；不依赖旧项目或本机 Typora 安装。

## 结果

在 1 MiB 文档尾部粘贴 10 KiB 纯文本，最终三轮受控 A/B 的粘贴稳定观察窗口中位数从 **7.70 秒降至 4.71 秒，缩短约 39%**。包括程序定位尾部光标的操作窗口从 **11.53 秒降至 4.89 秒，缩短约 58%**。修复组仍出现 **6.97 秒**的慢样本；这是可重复的局部改善，还没有达到大文档流畅编辑的目标。

另真实复现并修复了一处输入竞态：行内公式等待 MathJax 时，在另一段正常续写产生的排版任务，会被旧批次结束时清空，导致 `**fresh**` 留在普通文本节点。复现中的源码、BOM、换行和历史始终完整；修复使新任务被正常处理，真实 strong 节点也得到更新。

## 已提交的产品改动

| 提交 | 改动与依据 |
| --- | --- |
| `12d9c6b` | 先判定是否为代码语言字段，再读取 `isContentEditable`。普通正文不再触发这个无关的计算属性。单次读取曾实测约 2.8 秒；仅这一改动没有显著降低端到端耗时，未将它单独宣传为整体提速。 |
| `9ff714a` | 将 ZenUML 依赖中两条全局 Tailwind 初始化规则限定到 `.zenuml` 根、后代及其伪元素。每条规则原本给全部正文元素或伪元素声明 44 个专用变量。只修改生成 CSS 的两个选择器，保留全部声明与原特异性。 |
| `034455d` | 原生 Brush 在等待前捕获任务批次，成功后只按任务对象身份移除该批次；保留等待期间的新任务，包括同 CID 再编辑和重载后产生的新任务。失败时保留原队列，IME、鼠标按下和锁定判断保持有效。 |

生成转换均校验原资源 SHA、目标规则或方法的身份以及明确的修改位置。第三方源文件、版权说明和资源清单原始身份保持不变；生成清单记录输入、转换结果和输出身份。没有引入依赖更新、持久化格式或公共编辑 API 变更。

## 瓶颈证据与技术取舍

旧探针把先前键入的 2 秒滚动任务与粘贴混在同一阶段；新基准分别支持 `fresh`、`typing-drained`、`typing-overlap`。完整序列化通常是几十毫秒，不能解释秒级停顿。对自有 WebKit WebContent 进程的原生采样指向样式树、伪元素和自定义属性计算。

实际样式表库存发现 `mermaid-zenuml.css` 有 7,709 条 CSSOM 规则，包含未限定范围的 `*,:before,:after` 与 `::backdrop` 初始化器。样式隔离实验和只修改这两个选择器的 A/B 证实了其影响。CSSOM 对比覆盖全部 44 个变量、根与嵌套根、真实 utility、before/after/backdrop 和层叠优先级；真实 ZenUML 渲染及离线 HTML 导出也通过了验证。

没有采用以下缺乏收益或兼容性证据的候选：跳过滚动、同值 class 去重、移除选区样式、Sizzle 首选文档缓存、标题临时文档复用、继续移动 ZenUML 的全局配色变量。部分候选只改变强制布局发生的时机。配色变量迁移还会改变用户在祖先上覆盖变量的继承关系。相关实验保留在忽略目录，没有进入产品。

最终原生采样仍能观察到大 DOM 的样式解析、图层绘制与布局工作。不能把剩余延迟归结为已经消除的单一问题，也没有以省略源码同步、历史或输入保护来换取数字。

## 最终性能验收

环境：Apple M1 Max、10 个逻辑 CPU、32 GiB 内存、macOS arm64；Node 24.14.1、Playwright 1.63.0、WebKit 26.6。每个样本使用新的自有浏览器；性能测量期间没有并行运行构建或其他浏览器回归。

1 MiB 混合夹具含 BOM、混合换行、标题、列表、引用、表格、代码与图片，记录到 20,521 个根块、约 25.2 万个元素。这里测量的是**在 1 MiB 文档中粘贴 10 KiB 连续纯文本**，不是粘贴整个 1 MiB 文档。

A/B 使用同一份最终 JavaScript，只切换原始与修复后的 ZenUML CSS，以隔离样式修复的效果。执行顺序为 A1、B1、B2、A2、A3、B3。

| 指标 | 原 CSS，三轮中位数 | 修复 CSS，三轮中位数 | 缩短 |
| --- | ---: | ---: | ---: |
| 粘贴至精确 flush | 7.555 s | 4.561 s | 39.6% |
| 粘贴、flush 并等待两帧 | 7.626 s | 4.621 s | 39.4% |
| 粘贴稳定观察窗口 | 7.704 s | 4.705 s | 38.9% |
| 程序定位光标至观察窗口结束 | 11.530 s | 4.895 s | 57.6% |

稳定观察窗口的原始三次数据分别为 A：`7.704 / 8.050 / 7.421 s`，B：`4.705 / 6.973 / 4.632 s`。保留全部有效样本，不剔除修复组的慢样本；三次测量不足以估计 P95/P99 或作跨机器承诺。

| 补充场景（修复版，单次） | 粘贴至 flush | 等待两帧 | 观察窗口 |
| --- | ---: | ---: | ---: |
| WebKit 1 MiB，先键入 8 字符后粘贴 | 4.123 s | 5.825 s | 6.082 s |
| Chromium 1 MiB，直接粘贴 | 1.021 s | 1.073 s | 2.634 s |
| WebKit 100 KiB，直接粘贴 | 0.517 s | 0.542 s | 2.642 s |
| WebKit 10 KiB，直接粘贴 | 0.100 s | 0.111 s | 2.647 s |

观察窗口人为保留至少 2.6 秒，以观察旧输入任务与延迟滚动。小文档的约 2.6 秒是采样等待，不是产品在粘贴后强制等待 2.6 秒。键入后场景还包含早先输入任务的实际执行，未将其移动到计时之外。

全部 **10 组**最终夹具完成，**81 次**全文、撤销、重做、继续输入校验精确，错误数组为空。每组结束时已观测的非空转 timeout 回调均已派发完成、原生 Brush 队列为空、所观测的 Brush 顶层 Promise 已完成。不会据此推断一般 Promise、rAF 或浏览器内部任务的全部因果关系。磁盘输入身份在运行前后保持一致；A/B 的 73 个非候选 HTTP 资源在归一化 iframe channel 与静态资源数字缓存参数后，响应正文 SHA 全部一致，同一资源在单次运行内也没有正文漂移。

早期报告只排除永久 Brush 调度，却没有检查异步批次是否完成。这个基准缺陷已用 fake-clock 回归重现并修复；本节只采用 `schema: 2` 的最终数据，不把早期约 `10.95 → 4.64 s` 的观察混入上述统计。

测量时的 controller/recorder 逐字副本位于 `artifacts/webkit-paste/final/*-measured.mjs`，已与报告指纹核对。测后仅补充了收尾阶段错误/崩溃不能被标记成功的检查；这不修改计时窗口。10 组记录按该条件复核均通过，最后版本也完成了 10 KiB Playwright WebKit smoke。

## 输入与回归验证

| 检查 | 实际结果与范围 |
| --- | --- |
| `pnpm check` | 类型、边界检查通过；143 个测试文件、1,813 个单元测试通过。 |
| `pnpm test:runtime-transform` | 79 项通过，包含原生队列新增 CID、同 CID、restart、拒绝、IME/鼠标/锁定、focus 组合与字节恢复。 |
| `pnpm test:performance-harness` | 11 项通过；未完成的 Brush Promise、未知来源任务和拒绝不能被误报为排空。 |
| `pnpm build` | 编辑器、运行资源、Playground 与桌面前端构建通过；不代表原生安装包/发布验收。 |
| 最终组合浏览器回归 | Chromium/WebKit 共 176 项通过，包含文档生命周期、普通输入、粘贴、历史、结构键盘、大文档及真实 ZenUML/导出。 |
| 最终扩展浏览器回归 | 最终构建上 327 项通过、1 项明确跳过，覆盖富格式剪贴板、表格、右键、斜杠菜单、键盘、历史与导出。跳过项是 Chromium 专属 PDF 能力。上述分组存在重复覆盖，不合并为独立用例总数。 |
| 队列专项与相邻回归 | 双引擎 18 项通过。旧构建的 held 用例先失败于任务消失和 strong 未渲染；源码与历史检查仍通过；新构建全部通过。 |
| 改动文件静态检查 | 相关源码/测试/脚本 Biome 检查通过；忽略目录中的 recorder 通过 stdin 校验并验证输出字节一致。生成脚本保留一处既有信息级建议。 |
| 全仓 lint | 仍有 19 条既有错误，涉及的 16 个文件均与起点 `61116d7` 字节一致；没有为通过门禁调整规则或修改无关文件。 |
| Codacy | 未执行：本机没有对应 skill/CLI，没有初始化或上传。 |

大文档回归独立验证 UTF-8 字节、BOM、混合换行、Undo/Redo 恢复后的继续输入、两种编辑模式的合成 composition 生命周期以及 Source 往返。ZenUML 回归使用真实 renderer，离线 HTML 导出保留图形、容器和作用域内的初始化样式。

系统剪贴板、真实系统输入法候选、Windows/macOS 安装版 WKWebView/WebView2 以及原生系统打印未在本轮完成真机验收。合成事件、Playwright 引擎、浏览器 PDF 与真实宿主行为分别记录。原生 Brush 内部还有不被顶层 Promise 等待的离屏渲染路径，因此“Brush 服务收敛”不等于“全篇所有离屏预览已经完成”。

## 复现与证据

先构建，再在独立终端启动仓库测试服务；测量期间保持服务和代码不变：

```sh
pnpm prepare:runtime
node scripts/browser-test-server.mjs
node scripts/runtime-server.mjs
```

基准默认只校验配置和打印身份，加 `--run` 才启动自有浏览器。每次输出到新目录；原稿、各历史状态、队列日志与报告保留，浏览器在失败时也会清理。

```sh
node scripts/benchmark-runtime-paste.mjs --help
node scripts/benchmark-runtime-paste.mjs --run --label=baseline --scenario=fresh --zenuml-css=resources/editor/lib/diagram/css/mermaid-zenuml.css
node scripts/benchmark-runtime-paste.mjs --run --label=scoped --scenario=fresh
node scripts/benchmark-runtime-paste.mjs --run --label=after-typing --scenario=typing-overlap
pnpm test:performance-harness
```

可通过 `--page-url`、`--runtime-url` 使用独立端口；通过 `--frame-host`、`--main`、`--zenuml-css` 和可选 SHA 参数冻结对照资源。所有实际响应正文另外记录 SHA，不能用磁盘 hash 替代对 Vite 缓存响应的核验。

本机完整证据位于忽略目录：

- `artifacts/performance/runtime-paste/20261024-v2-*/report.json`：最终 10 组验收。
- `artifacts/webkit-paste/validated-v2-summary.json`：统计、原始数值与资源身份对照。
- `artifacts/webkit-paste/native-sample.txt`、`native-sample-final.txt`：自有 WebContent 的原生栈采样；采样运行不用于性能验收数字。
- `artifacts/webkit-paste/brush-input-race-report.json`、`brush-queue-red.log`、`brush-queue-green.log`：真实输入竞态的对照、红绿证据。
- `artifacts/webkit-paste/*-red.log`、`runtime-transforms-final.log`、`performance-harness-final.log`：转换与基准回归。
- `artifacts/webkit-paste/final-check-after-brush.log`、`final-build.log`、`final-browser.log`、`final-broad-browser.log`、`lint-baseline-comparison.json`：最终工程检查与浏览器验证。

剩余的高节点密度 WebKit 延迟是真实限制。继续缩减绘制/布局成本需要对滚动、跨块选区、复杂 Markdown、输入法和主题兼容作新的行为证明；本轮已提交的是经过验证的局部修复，不能据此宣称编辑器已达到“完全体”。
