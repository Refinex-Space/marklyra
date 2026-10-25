# 编辑器性能复现

以下命令在仓库根目录执行。依赖版本以锁文件为准；测量期间保持代码、构建输出和测试服务不变，不并行运行构建或其他回归。使用合成文稿与独立浏览器，结果只代表记录的设备、引擎和工作负载。

## 大文档粘贴

先运行 `pnpm prepare:runtime`，再分别在两个终端启动服务：

```sh
node scripts/browser-test-server.mjs
```

```sh
node scripts/runtime-server.mjs
```

默认页面为 `http://127.0.0.1:4173/runtime.html`，运行页为 `http://127.0.0.1:4174/index.html`。测试页面服务关闭文件监视，源码变化后需重启自己启动的服务。已有服务占用端口时，不关闭其他实例；为自有服务配置独立端口，并通过基准的 `--page-url`、`--runtime-url` 指向实际地址。

```sh
node scripts/benchmark-runtime-paste.mjs --help
node scripts/benchmark-runtime-paste.mjs --label=current --scenario=fresh
node scripts/benchmark-runtime-paste.mjs --run --label=current --scenario=fresh
node scripts/benchmark-runtime-paste.mjs --run --label=after-typing --scenario=typing-overlap
pnpm test:performance-harness
```

不带 `--run` 时只校验配置和输入身份，不启动浏览器、不生成报告。默认使用 WebKit，在 1 MiB 文稿尾部粘贴 10 KiB 纯文本；这不等于一次粘贴整个 1 MiB 文稿。支持 `--engine=chromium`，文稿大小可用 `--bytes=10240|102400|1048576` 指定。

场景包括直接粘贴 `fresh`、等待先前键入任务完成后粘贴 `typing-drained`、与先前键入任务重叠的 `typing-overlap`。不要把不同场景的耗时合并比较。

每次测量创建新输出目录，默认位于 Git 忽略的 `artifacts/performance/runtime-paste/`；也可用 `--output` 指定尚不存在的目录。保留失败报告、原文、历史状态、错误和输入身份，但不把失败或输入漂移样本计入性能结果。

## 对照与计时边界

- 用 `--frame-host`、`--main`、`--zenuml-css` 指定冻结的对照输入，分别以 `--frame-sha`、`--main-sha`、`--css-sha` 校验预期身份。当前源码已包含修正，不能把当前源码和当前生成 CSS 当成修复前后的两组输入。
- 比较 CSS 时保持 JavaScript、夹具、录制器、场景和引擎一致，串行交替执行 A/B 与 B/A。比较运行前后的磁盘身份及实际 HTTP 响应正文 SHA；磁盘相同不能证明 Vite 返回了同一版本。
- 分别观察粘贴至精确 flush、flush 后两帧、稳定观察窗口，以及包含光标定位或先前键入的完整操作窗口。稳定窗口至少保留 2.6 秒以观察延迟任务；小文稿约 2.6 秒的结果不能解释为产品强制等待。
- 检查已观测 timeout、Brush 队列及顶层 Promise 的完成状态；这不能证明浏览器内部任务或所有离屏预览都已完成。Chromium CDP 的 JS heap 采样也不等于原生或总进程内存。
- 性能结果须同时满足原文字节、BOM、混合换行、撤销、重做和继续输入校验。保留慢样本；少量重复测量不能推断 P95/P99 或跨平台性能。

## 回归与维护

排版优化必须保留输入保护、源文本同步和历史恢复。异步排版应只移除已完成批次，不能丢弃等待期间新增或同节点再次编辑的任务。调整图表 CSS 的作用域时，须核对声明、特异性、继承、伪元素及离线导出，避免以改变文稿语义或主题行为换取性能数字。

性能录制器回归由 `pnpm test:performance-harness` 执行；编辑器行为回归见根 [README](../../README.md#验证)。Playwright 引擎和合成输入不能替代 WKWebView、WebView2、系统输入法、系统剪贴板及打印验收。

知识图谱原生测量的工作负载和入口见 [知识图谱文档](../../docs/KNOWLEDGE-GRAPH.md#验证与复现)。
