# 资源与第三方许可

本目录保留第三方版权、许可证及字体/图标通知。运行资源与应用源码分开管理；资源位于忽略的本地输入目录，不随 SDK 源码归档分发。

根目录 `LICENSE` 为仓库自有代码的许可文本，不能替代第三方组件与本地私有资源的各自许可。

- `config/runtime-source.json` 固定资源源文件身份。
- `config/restricted-assets.json` 固定不得混入 Git/npm 的资源摘要与精确通知例外。
- `config/dependency-inventory.json` 记录锁定依赖与收到的许可文本。
- `scripts/check-provenance.mjs` 检查实际 Git 字节；`scripts/pack-editor.mjs` 检查真实归档。

名称变更不改变资源的版权或分发许可。项目包保持 private/UNLICENSED；本地构建成功不构成公开发行授权。
