# 捆绑字体通知

本目录包含许可证文本、版权通知和24项字体身份映射。字体源码保存在 Git 管理的 `resources/editor/style`，构建后位于 `dist/editor-runtime/style`。

本地桌面构建应将本目录整体随字体附带，不能只复制摘要或 URL。`manifest.json` 的 `fonts` 对应 `scripts/runtime-shell-font-manifest.mjs` 的全部24个路径/SHA；`noticeFiles` 列出7份必需通知的哈希。构建器还应附带本 README 和 manifest 本身。

- Open Sans 1.10 使用 Apache-2.0，未套用新版 Open Sans 的 OFL。
- Raleway、Didact Gothic、PT Serif、Merriweather、Lato 使用 OFL-1.1；各自版权及 Reserved Font Names 见 FONT-NOTICES.txt。Raleway 另附同代官方完整 OFL 文件。
- TeXGyreAdventor 1.104 的 GUST/LPPL 许可已识别，附收到的2006版、上游1.0版及 LPPL-1.3c。原 webfont 转换/子集链和完整1.104历史 Work/manifest尚未核实，不能凭文本齐全宣称这一来源问题已解决。

