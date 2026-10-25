# 编辑器内部源码构建与验证

编辑器核心输入与宿主适配由工作区中的包和应用管理。项目采用根 `LICENSE` 的 Apache-2.0，必要第三方通知集中在根 `THIRD-PARTY-NOTICES.txt`；构建直接附带这两份文本。

## 源码归属

- `packages/editor-runtime/src/engine/`：编辑器程序、worker 和编辑器数据。
- `packages/editor-runtime/src/page/`：运行页面与 HTML 模板。
- `packages/editor-runtime/assets/`：样式、语言包、图像及编辑器资产。
- `packages/editor-runtime/vendor/`：保持既有版本的随附库。
- `packages/editor-themes/`：项目主题及主题资产。
- `apps/desktop/src/features/settings/runtime-preferences/page/`：设置页内部源码。
- `apps/desktop/src-tauri/icons/titlebar/`：原生标题栏 PNG。

`pnpm prepare:runtime` 从上述输入构建 `packages/editor-runtime/dist/page/`。生成目录由 Git 忽略，不作为第二份可编辑源码。桌面打包与开发服务器读取相同输出，编辑器和设置页保持独立 origin、类型化消息与受限原生能力。

## 完整性

`config/runtime-source.json` 记录输入路径、大小、SHA-256 和输出映射。修改被登记的输入后同步更新对应身份记录。资源及原始通知的 Git 属性关闭自动换行转换，保证不同宿主的检出字节一致。

`pnpm check:resources` 校验声明的构建输入，拒绝缺失、字节漂移及符号链接。`node scripts/check-provenance.mjs --worktree` 检查未提交的实际文件；`--tracked` 检查 Git 暂存内容；`--history` 检查可达历史中的路径与 source-map 边界，不重写历史。

源码内化允许内部引擎及其构建输出进入包的显式文件清单，不再以相同字节禁止自有源码分发。`private: true` 继续禁止自动包发布。`pnpm pack:editor` 在本地核对真实归档、根许可证、文件安全边界和导出目标。

## 验证范围

按根 README 执行类型、依赖边界、单元、Node 脚本、编辑器浏览器、桌面 Shell、Rust 和构建检查。原生 GUI、真实输入法、打印、剪贴板和安装升级需要在对应平台另行验证；浏览器替身和跨平台静态检查不能替代这些结果。

每次迁移的实际测试结果单独记录，不从历史报告推定当前构建通过。
