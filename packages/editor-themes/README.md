# @marklyra/editor-themes

MarkLyra 的editor-themes模块。使用仓库根目录的构建与测试命令。

内置主题仅提供 `marklyra-light`（MarkLyra Light）和 `marklyra-dark`（MarkLyra Dark）。
两者共用本包的 `base.css` 排版，构建时追加本目录的配色和共享样式，生成到 `packages/editor-runtime/dist/page/style/themes`。主题字体由本包的 `assets` 管理，保留第三方字体原始字节；项目自有代码采用根 `LICENSE`。
深色版使用炭黑背景、分层表面、柔和边框，以及适配正文、代码、表格和图表的语义颜色。用户主题仍从应用配置目录单独加载。
