# 编辑器源码资源

- `editor/`：编辑器前端代码、样式、字体、语言包与设置页面输入。
- `native-titlebar/`：原生标题栏使用的四张 PNG。

这些目录属于完整项目源码，必须参与 Git 追踪。`config/runtime-source.json` 记录当前文件身份；来源版本用于追溯，不代表启动时需要安装其他应用。原始第三方通知保持原样。原应用的 `lib/bin` 平台可执行文件不参与 MarkLyra 运行或构建，因此不纳入项目。

`pnpm prepare:runtime` 校验全部输入，再执行源码适配转换并生成 `dist/editor-runtime/`。适配层代码位于 `packages/editor-runtime/`，转换逻辑位于 `scripts/lib/runtime-*.mjs`。生成目录不进入 Git，不直接修改。

修改资源时保留原有编码和换行，并同步更新 `config/runtime-source.json` 对应文件的 `size` 与 `sha256`，然后执行 `pnpm check:resources` 和相关转换回归。`resources/**` 的 Git 属性禁用自动文本转换，确保 Windows、macOS 的检出字节一致。
