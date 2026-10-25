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

## 模块化引擎与设置页

`src/engine/main.js` 仅保留经典脚本加载器和启动外壳。`src/engine/bundles.json` 按执行顺序列出模块，`modules/` 下的 `model`、`editing`、`render`、`media`、`document`、`ui`、`host`、`export`、`codemirror`、`shared` 和 `libraries` 分别维护模型、编辑、渲染及相关实现。每个文件保留一个完整的注册或初始化表达式，文件头标明原模块 ID 和依赖。

设置页 `page/static/js/bundles.json` 管理两个 Webpack chunk。`modules/preferences/` 维护设置面板、控件、图标、语言与宿主桥接；`modules/shared/` 保留随原 chunk 打包的库与辅助函数。清单中的 `null` 表示原始稀疏模块数组的空槽，不得删除或按文件名重排。已有 chunk 文件名作为运行地址继续保留，不代表新输出的内容摘要。

Emoji 关键词数据维护在 `src/engine/editor/emoji-search-map.json`，建议项的数组顺序保持不变。`editor/EmojiSearchMap.js` 保留原来的 `window.EmojiSearchMap` 赋值接口，由构建填入数据。`finder-worker.js` 原本已可读，仍独立维护。

`scripts/lib/source-bundles.mjs` 使用语法树定位外壳中的显式表达式槽，将模块按清单组装进同一词法作用域，不执行模块、不转换为 ESM、不改变 `this`、严格模式、模块 ID、依赖数组及启动队列。输出仍为原来的四个经典脚本地址，不增加浏览器模块请求。不要直接运行外壳或独立注册文件，也不要手工编辑 `dist/page`。

新增模块时同时更新对应 `bundles.json` 并运行 `pnpm sync:runtime-sources`；仅编辑已有模块时也需要同步输入摘要。所有外壳、模块、清单及 Emoji 数据都进入输入身份校验。运行清单为每个组装脚本记录完整的 `sourceInputs`，来源审计会重新组装并核对输出摘要，拒绝遗漏或过期的输入记录。

这些文件是从已有 JavaScript 产物整理出的可维护表示，并非原作者工程的恢复。自有模块的依赖别名、解析规则、状态、模型／DOM 对象、事件和回调参数按声明、引用与调用关系逐项命名；导出属性、协议键、模块 ID 和字符串内容保持原样。具有多个用途的绑定按共同职责命名，不能仅凭首次赋值推测类型或批量替换同名文本。

本轮对剩余 5,545 个一至两字符绑定的核对已完成：5,489 个采用语义名称；56 个属于内嵌库或编译辅助实现，保留既有字节。原有 847 个具名函数、类、具有推断函数名的绑定或动态作用域可见绑定继续保留名称，避免改变反射或字符串执行行为。计数按词法绑定而非文本出现次数，不要求消除所有短名。

第三方 `libraries/`、CodeMirror 附加代码、jquery-localize、快捷键库、设置页共享库及编译辅助模块不参与局部命名整理。自有模块中嵌入的 Promise polyfill、Unicode 显示宽度实现、Babel 数组展开辅助函数，以及 Markdown 解析器的正则组合／属性合并辅助函数，也按保留片段处理；不能仅按目录判断归属。必要版权与许可通知继续由根通知文件管理，独立 `vendor/` 发行文件也保持原样。

## 样式、启动上报与语言数据

`assets/styles/base.css` 和 `base-control.css` 按文档排版、控件、代码、表格、图片、侧栏等职责原地分区。分区注释只提供导航，选择器、声明、重复回退值、媒体查询和关键帧的顺序保持。维护时保留相对 URL 的解析位置及 `!important` 优先级。自定义属性冒号后的既有空白也保留，避免改变 JavaScript 读取到的属性文本。

`codemirror.css` 是上游规则与本地适配的混合文件。随附核心 JavaScript 自报 `5.26.0`，样式中同时存在与 [CodeMirror 3.16.0 核心样式](https://github.com/codemirror/codemirror5/blob/3.16.0/lib/codemirror.css) 相符的旧版布局规则，以及本地的自动高度、滚动、`cm-s-inner` 主题和背景适配，不能据核心版本推定整份 CSS 的来源。确认的库规则与归属不确定的历史规则保留原字节；本地声明留在原规则中的原位置展开。`base.css` 中的代码块内边距规则、`base-control.css` 中的光标规则及 [lint](https://github.com/codemirror/codemirror5/blob/5.26.0/addon/lint/lint.css)／[show-hint](https://github.com/codemirror/codemirror5/blob/5.26.0/addon/hint/show-hint.css) 片段采用相同边界。带保留注释的紧凑片段是有意保留的第三方或历史实现，不能由通用格式化覆盖。

`src/page/index.html` 的首个内联脚本负责捕获启动和资源错误，必须先于 `frame-host.js` 注册捕获阶段监听。语言数据位于 `assets/locales/{Base,zh-Hans}.lproj/`；四类字典以缩进 JSON 维护，保留键顺序、字符串、转义和占位符，同一份输入同时复制到编辑器与设置页。

## 完整性

`config/runtime-source.json` 记录输入路径、大小、SHA-256 和输出映射。修改被登记的输入后同步更新对应身份记录。资源及原始通知的 Git 属性关闭自动换行转换，保证不同宿主的检出字节一致。

`pnpm check:resources` 校验声明的构建输入，拒绝缺失、字节漂移及符号链接。`node scripts/check-provenance.mjs --worktree` 检查未提交的实际文件；`--tracked` 检查 Git 暂存内容；`--history` 检查可达历史中的路径与 source-map 边界，不重写历史。

源码内化允许内部引擎及其构建输出进入包的显式文件清单，不再以相同字节禁止自有源码分发。`private: true` 继续禁止自动包发布。`pnpm pack:editor` 在本地核对真实归档、根许可证、文件安全边界和导出目标。

## 维护边界

编辑器行为修正直接维护在包内源码，行为回归解析和执行当前源码；不恢复按历史摘要和字符偏移修改构建输入的补丁链。输入清单使用稳定项目标识，产品版本由根配置读取，正常版本递增不应改变未修改资源的身份。

样式、语言和随附库的裁剪须同时核对加载与回退引用。主题和图片字段兼容应有明确的回归范围；富文本剪贴板保留普通及自定义 URI 数据时，仍需拒绝可执行代码和私有能力 URI。导航与图片访问继续由宿主独立校验，不能因兼容处理扩大权限。

## 验证范围

按根 README 执行类型、依赖边界、单元、Node 脚本、编辑器浏览器、桌面 Shell、Rust 和构建检查。原生 GUI、真实输入法、打印、剪贴板和安装升级需要在对应平台另行验证；浏览器替身和跨平台静态检查不能替代这些结果。

每次迁移的实际测试结果单独记录，不从历史报告推定当前构建通过。

模块组装回归：`node --test scripts/lib/source-bundles.test.mjs`。引擎行为回归继续通过 `scripts/lib/runtime-test-source.mjs` 在内存中组装当前源码后解析执行；浏览器故障注入读取本次构建生成的脚本，避免把外壳当作完整引擎。

局部改名使用 `scripts/lib/javascript-bindings.mjs` 对照词法声明和引用关系，并保持自由变量、属性键、运算、字面量及语句顺序；先检查每个模块，再检查四个完整组装脚本，以捕获同作用域重名和跨模块闭包引用变化。保留片段、加载外壳及顺序清单另做字节校验。检查器自身的遮蔽、闭包、对象简写、`eval` 和可观察函数名回归：`node --test scripts/lib/javascript-bindings.test.mjs`。行为测试按真实导入和调用结构定位依赖，避免把压缩后的局部拼写当成接口。
