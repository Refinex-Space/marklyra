# 第三方组件通知

本目录保留第三方组件、字体、图标的原始版权和许可证通知；`dependencies/` 保存依赖通知正文及版本映射。根目录 `LICENSE` 不替代各组件的原始通知。

编辑器资源与原生标题栏图像作为项目输入保存在 `resources/` 并参与 Git 追踪，不再需要单独准备私有运行资源。

- `config/runtime-source.json` 记录资源相对路径、大小和 SHA-256。
- `scripts/check-runtime-sources.mjs` 校验工作区输入，`scripts/check-provenance.mjs` 校验 Git 中的实际字节及完整性。
- `config/dependency-inventory.json` 记录依赖版本与通知映射。
- `scripts/pack-editor.mjs` 校验 SDK 归档的文件边界；桌面运行资源单独构建和打包。
