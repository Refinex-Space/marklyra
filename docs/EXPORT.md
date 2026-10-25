# 导出架构

导出覆盖 PDF、HTML、HTML（无样式）、图像，以及由 Pandoc 转换的 Word / OpenOffice / RTF / EPUB / LaTeX /
Media Wiki / reStructuredText / Textile / OPML，外加用户自定义的 Pandoc 导出。Windows 与 macOS 共用同一套
设置、同一条流程；只有渲染引擎因系统而异。

## 数据流

```
编辑器（隔离渲染页）──exportHTML──▶ 自包含 HTML 快照 ──▶ HTML / PDF / 图像
                    └─exportMarkdown─▶ 图片已内嵌的 Markdown ──▶ Pandoc ──▶ docx / odt / …
```

- **HTML 快照**由编辑器运行时在一次性隔离渲染器里生成：样式、字体、图片、公式、图表全部内嵌，CSP
  禁止脚本与外部资源。HTML、PDF、图像共用它，因此三者的版式一致。
- **Pandoc 格式不吃 HTML，而吃 Markdown 源码。** 公式因此保持为原生公式（Word 里是 OMML），脚注、表格、任务列表、
  删除线、高亮、上下标、emoji 都按 Markdown 语义转换。本地图片由渲染器解析并内嵌为 `data:` URI（`exportMarkdown`），
  Pandoc 全程以 `--sandbox` 运行，不读取任何文档引用的文件。`[TOC]` 单独成行时转为 `--toc`。
- Pandoc 的警告不再拦截导出：文件照常写出，警告随结果返回（`SavedExport.warnings`）。

## 渲染引擎

| 输出 | Windows | macOS |
| --- | --- | --- |
| HTML / HTML（无样式） | 同一实现 | 同一实现 |
| PDF | WebView2 DevTools `Page.printToPDF`：直接写文件，支持纸型、边距、页眉页脚（含页码）、书签、背景色 | 系统打印面板（WKWebView `NSPrintOperation`），在面板中存为 PDF；页眉页脚由面板的“打印页眉和页脚”控制 |
| 图像 | WebView2 DevTools `Page.captureScreenshot`（整篇，`captureBeyondViewport`） | WKWebView 快照 |
| Pandoc 格式 | 同一实现 | 同一实现 |

能力差异由 `get_format_capabilities` 如实上报（`pdf: direct | dialog`、`headerFooter`、`image`），设置页只显示当前宿主真正
生效的选项，不铺设无效控件。

## 设置（`export_preferences`）

一份由 Rust 持有、带版本号（CAS）的记录，所有窗口共享：

- `general`：`folderMode`（`document` 与原文件同目录 / `custom` 指定文件夹）、`folder`、`openLocation`、`openFile`。
- `html` / `pdf` / `image`：导出主题、`extraCss`（≤16 KiB 静态样式）；PDF 另有纸型、方向、边距、按一级标题分页、书签、
  背景色、作者、页眉/页脚（左/中/右三区，变量 `${title}` `${author}` `${pageNo}` `${totalPages}` `${today}`）；
  图像另有宽度、质量（1×/2×/3×）、字号。
- `formats`：九种内置 Pandoc 格式各自的 `toc` / `tocDepth` / `numberSections` / `referenceDoc`（仅 Word、OpenOffice）/
  `template` / `extraArguments`。
- `custom`：最多 12 项自定义 Pandoc 导出（名称、输出格式、扩展名、同上选项），出现在“文件 → 导出”菜单中。
- `pandocPath`：为空表示自动探测（`PATH`，然后常见安装位置）。

安全约束：

- **路径只能来自系统对话框**（`choose_export_path`、`choose_pandoc_path`）。普通的设置写入拒绝任何新路径，只接受清空或原值。
  Pandoc 必须是名为 `pandoc` 的本机二进制，拒绝脚本，每次运行前核对实体是否被替换。
- **额外参数不是命令行**：分词后逐项对照白名单（目录、编号、`-V`、`-M`、换行宽度等版式选项），`--filter`、`--lua-filter`、
  `--output`、`--css`、模板、包含文件等一律拒绝，再以独立 argv 传给 Pandoc（`exports/arguments.rs`）。
- 自定义导出的输出格式只允许 Pandoc 写出器名称（不含路径），扩展名排除可执行/脚本类型；输出必须是完整 ZIP 或干净 UTF-8。
- 导出文件只写到用户在保存对话框中确认的位置，覆盖前核对原文件未被改动；绝不覆盖当前 Markdown 原稿。
- “在文件夹中显示 / 打开”只接受本次运行导出的文件。

## 命令

| 命令 | 作用 |
| --- | --- |
| `get_export_preferences` / `put_export_preferences` | 读取 / 以版本号写入设置对象 |
| `choose_pandoc_path` / `choose_export_path` | 系统对话框选择 Pandoc、默认文件夹、样式参考文档、模板 |
| `check_export_arguments` | 与导出时同一套规则的额外参数校验，供设置页即时提示 |
| `get_format_capabilities` | Pandoc 状态与版本、可用格式与写出器、PDF/图像/页眉页脚能力 |
| `save_export_html` / `save_export_pdf` / `save_export_image` / `save_export_format` | 各格式导出，返回 `{ path, bytes, warnings }` |
| `open_print_preview` | 打印预览（macOS 的 PDF 入口，Windows 的系统打印） |
| `reveal_export_file` / `open_export_file` | 显示 / 打开刚导出的文件 |

## 验证范围

- Rust 回归覆盖设置模型与校验、参数白名单、PDF 版面解析与页眉页脚转义、落点与“显示”权限、输出校验和 Pandoc 转换；真实转换需具备可用的 Pandoc。
- 浏览器回归检查设置与导出交互，宿主 IPC 使用替身。
- 在 Windows WebView2 与 macOS WKWebView 分别验证实际 PDF、图像、系统打印面板及保存流程，核对页数、书签、页眉页脚和像素尺寸。编译或浏览器替身通过不代表原生导出通过。
