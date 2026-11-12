# MarkLyra 设计规范：Liquid Glass

MarkLyra 的界面采用 Liquid Glass 设计语言。它的依据是 Apple 在 WWDC 2025 发布、随 macOS Tahoe 26 推出的同名材质，按 MarkLyra 的实际情况做了一处取舍：macOS（WKWebView）和 Windows（WebView2）只用一套 Web 实现，两端在像素上保持一致。

材质 token 全部在 [`packages/editor-themes/liquid-glass.css`](../packages/editor-themes/liquid-glass.css)，主窗口（`main.tsx`）、设置页 iframe（`settings-page.ts`）和编辑器运行页（构建时收集为 `style/liquid-glass.css`，`index.html` 在主题样式之前加载；`data-theme` 由文档背景亮度决定，见 `runtime/glass-scheme.ts`）都引入同一份文件。组件只引用 token，不自己写玻璃参数。

## 1. 原则

1. **玻璃只放在功能层。** 侧栏、检查器、浮层、菜单、对话框、悬浮按钮用玻璃；文档正文、设置页内容、任务看板这些内容层用不透明材质。内容层里也出现玻璃，层级就分不清了。
2. **可读性优先于通透。** 承载大量文字的表面（侧栏、对话框、菜单）用更厚、更不透明的玻璃；只有很小的、悬在内容上的控件用 clear 玻璃。
3. **玻璃本身无色。** 填充一律是中性白（浅色）或中性深灰（深色），颜色来自背后被模糊、提饱和后的内容。强调色只用于主操作的背景和选中态，不同时给多个控件着色。
4. **克制。** 一屏里同时出现的玻璃层不超过 4 个，玻璃之上不再叠玻璃。
5. **两端一致。** 两端的差异只限于操作系统决定的部分：窗口按钮、快捷键文案、原生菜单栏、macOS 原生标签页。

## 2. 为什么不用折射和原生 vibrancy

调研结论如下，规范以此为前提：

| 方案 | WebView2（Chromium） | WKWebView（WebKit） | 结论 |
| --- | --- | --- | --- |
| `backdrop-filter: url(#svg)` + `feDisplacementMap` 折射 | 支持 | **不渲染** | 两端效果不同，不采用 |
| 对元素自身做位移贴图（liquidglass.dev 的做法） | 支持 | 支持 | 只能折射已知的图片背景，对任意 DOM 无效，不采用 |
| WebGL/WebGPU 着色器（Liquid Glass Studio） | 支持 | 支持 | 需要把背景栅格化到纹理，编辑器 iframe 做不到，不采用 |
| 原生窗口材质（NSVisualEffectView / Mica / Acrylic） | Win11 才有 Mica | 支持 | 两端外观不同，透明窗口还要开 `macOSPrivateApi`，现阶段不采用（见 §11） |
| **`backdrop-filter: blur() saturate()` + 镜面高光边 + 分层阴影** | 支持 | 支持（同时写 `-webkit-` 前缀） | **采用** |

所以 MarkLyra 的 Liquid Glass 由六个视觉要素构成：**半透明中性填充、背景模糊加饱和、顶部镜面光泽（sheen）、内侧高光边（rim）、菲涅尔边缘光（玻璃边缘比中心亮）、分层投影（depth）**，再配上弹性动效。

## 3. 层级

```
L3 浮层     菜单、弹出层、快速打开、提示、对话框      regular / thick 玻璃，backdrop-filter
L2 功能层   文件侧栏、右侧大纲/AI 检查器、设置导航     pane 玻璃（无 backdrop-filter，见 §4）
L1 内容层   文档卡片、设置内容卡、首页卡片             不透明，只靠阴影抬升
L0 画布     窗口底、标题栏带、设置页底               环境光场
```

- **L0 画布**（`--shell-canvas-paint`）：文档底色向文字色混 `--lg-canvas-ink`（浅 9%、深 6%），叠加两团环境光：左上是强调色，右下是紫色（浅 24%/18%，深 9%/7%）。浅色的画布要比玻璃暗一档、光要更足，否则半透明的白玻璃透出的颜色太淡，看不出材质。`background-attachment: fixed`，整片光场按窗口定位，标题栏带和设置页都是它的一部分，没有接缝。
- **整个窗口只有一片画布。** 设置页 iframe 不画自己的底（`html` 透明），由壳层的 `.preferences-page` 绘制。iframe 和宿主的 `color-scheme` 始终一致，浏览器才会让它保持透明。任何新的 iframe 页面都按这个方式处理，不要在 iframe 里再画一份渐变：坐标系不同，两份必然对不齐。
- **L1 内容**：`--marklyra-body-bg` 不透明填充，1px `--lg-edge` 细边（与玻璃窗格同一条轮廓），`--lg-depth-pane` 投影，不加 rim 和 sheen。
- **L2 功能层**：`--lg-surface-pane` 填充（左上角镜面受光 + 纵向光泽 + `--lg-fill-pane`），`--lg-edge` 边，`--lg-shadow-pane`（rim、菲涅尔边缘光加投影）。窗格内部（头部、列表、页脚、日历）不再铺 `--sidebar` 底色，`style.css` 在窗格作用域里把 `--sidebar` 设为 `transparent`。
- **L3 浮层**：见 §5 材质表。

## 4. 材质

| 材质 | 填充（浅 / 深） | 模糊 | 用途 |
| --- | --- | --- | --- |
| `clear` | 白 42% / 深灰 42% | `blur(14px) saturate(1.7)` | 悬在正文上的小控件：回到顶部、画布工具条、浮动标签 |
| `regular` | 白 74% / 深灰 72% | `blur(28px) saturate(1.8)` | 菜单、弹出层、快速打开、提示、建议列表 |
| `thick` | 白 86% / 深灰 86% | `blur(36px) saturate(1.6)` | 对话框、确认框、长表单 |
| `pane` | 白 42% / 白 3.5%，叠 `--lg-pane-sheen` | 无 | 侧栏、检查器、设置导航 |
| `control` | 白 62% / 白 8% | 按需 | 分段控件滑块、开关旋钮、输入框底 |

**pane 不加 backdrop-filter**：它下面是静态的画布，模糊也只是模糊一片渐变，看不出区别，却要为两块全高的窗格持续合成。只有内容会在下面移动的表面（浮层、悬浮控件）才用 backdrop-filter。

一个玻璃浮层的标准写法：

```css
.example-popover {
  background: var(--lg-surface-regular);           /* sheen + fill */
  -webkit-backdrop-filter: var(--lg-filter-regular);
  backdrop-filter: var(--lg-filter-regular);
  border: 1px solid var(--lg-edge);
  border-radius: var(--lg-radius-popover);
  padding: var(--lg-popover-padding);
  box-shadow: var(--lg-shadow-popover);            /* rim + depth */
  animation: lg-materialize var(--lg-duration) var(--lg-ease-spring);
}
```

`-webkit-backdrop-filter` 必须写：macOS 11–13 自带的 WKWebView 只认带前缀的写法。

## 5. Token 速查

### 几何（同心圆角）

内圆角 = 外圆角 − 两者之间的内边距。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--lg-radius-xs` | 6px | 小图标按钮、kbd、标签 |
| `--lg-radius-control` / `--lg-radius-item` | 8px | 按钮、输入框、菜单项、列表行 |
| `--lg-radius-pane` | 12px | 三窗格、设置卡片（= `--pane-radius`） |
| `--lg-radius-popover` | 14px | 菜单、弹出层（14 = 8 + 6 内边距） |
| `--lg-radius-dialog` | 20px | 对话框（20 = 8 + 12 内边距） |
| `--lg-radius-capsule` | 999px | 主按钮、悬浮圆钮、拖动握把 |
| `--lg-popover-padding` | 6px | 浮层内边距，与菜单项圆角配套 |

窗格与窗口边缘的间距是 `--pane-gap`（8px），窗格之间是 `--pane-divider-gap`（4px），设置页用同样的两个值（`--settings-gap` / `--settings-divider-gap`）。标题栏高度 macOS 28px、Windows 32px。

### 颜色与交互

| Token | 用途 |
| --- | --- |
| `--lg-accent` | 强调色，用于选中态色调、链接、强调文字。浅 `#2f74d0`，深 `#4d97ff` |
| `--lg-accent-fill` / `--lg-accent-ink` | 主操作按钮的背景与文字。深色下背景是强调色混 30% 黑，保证白字 ≥ 4.5:1 |
| `--lg-danger` | 破坏性操作的文字或背景 |
| `--lg-hover` / `--lg-pressed` | 中性悬停、按下叠色 |
| `--lg-selected` / `--lg-selected-strong` | 选中态：强调色 14%/22%（深色 20%/30%） |
| `--lg-edge` / `--lg-hairline` / `--lg-separator` | 玻璃轮廓、细线、分隔线 |
| `--lg-scrim` | 对话框遮罩：浅色黑 16%，深色黑 40%，不加模糊 |

文档主题提供的侧栏变量（`--marklyra-article-selected-bg` 等）仍然优先，主题没有定义时才回落到 `--lg-*`。

### 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `--lg-ease-spring` | `cubic-bezier(0.34, 1.32, 0.64, 1)` | 出现、按下回弹 |
| `--lg-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 位移、展开 |
| `--lg-duration-fast` / `--lg-duration` / `--lg-duration-slow` | 120 / 200 / 320ms | 颜色 / 浮层 / 对话框 |
| `--lg-press-scale` | 0.97 | 控件按下时的形变 |

关键帧：`lg-materialize`（从锚点下方弹出）、`lg-materialize-up`（从下往上，用于底部提示、悬浮钮）、`lg-sheet-in`（对话框）、`lg-scrim-in`（遮罩）。动效只改 `opacity`、`scale`、`translate` 三个独立属性，不覆盖组件自己的 `transform` 定位。消失不做动画，React 卸载即消失，这样关闭总是即时的。

**打开时自己测量尺寸来定位的浮层**（子菜单、靠边翻转的右键菜单、用脚本限高的下拉框）不能用带 `scale`、`translate` 的关键帧，否则会测到缩小后的盒子。这类浮层只用 `lg-scrim-in` 淡入。

## 6. 组件规则

**窗格（L2）**：见 §3。窗格之间 4px 的缝就是拖动手柄，命中范围总宽 16px，主要伸进侧栏一侧；握把为 3×36px 的胶囊，悬停 160ms 后从 70% 高度回弹到 100%。

**设置页**：与主窗口同一套几何和材质：导航卡是 L2 玻璃，内容卡是 L1。有些分区（导出、智能体、Git、日历等）是壳层盖在 iframe 内容卡上的 React 页面（`.preferences-native-overlay`），它的位置必须与 iframe 内容卡完全重合，按“窗口边距 + 侧栏宽 + 卡片缝”计算，不能另写公式；`pane-cards.spec.ts` 逐个分区校验这一点。

**滚动条**：系统的常显式滚动条（macOS“始终显示”或接了鼠标）自带一层轨道底色，会在每块面板上画出一条竖带。页面无法可靠地跟随系统在叠加式和常显式之间切换（接鼠标、窗口显示的时机、WebKit 对已创建滚动条的缓存都会干扰），所以 WKWebView 上一律画同一种滚动条：透明轨道，缩进 3px 的胶囊滑块（`--lg-scroll-thumb`，悬停和拖动时加深），宽 11px，从首帧生效，不做探测。规则只对 WebKit 生效（`@supports (-webkit-backdrop-filter: none)`），WebView2 的 Fluent 叠加滚动条保持系统原样。规则写成最低特异性的 `::-webkit-scrollbar`，组件自己隐藏或定制的滚动条优先。**组件里不要写 `scrollbar-color`，也不要直接写 `scrollbar-width: thin`**：WebKit 一旦在某个滚动容器上采用这两个标准属性（`none` 除外），就会忽略它的 `::-webkit-scrollbar`，改画系统滚动条和它的轨道底色。文件树就曾因为一句 `scrollbar-width: thin` 一直露出系统轨道。需要细滚动条时写 `scrollbar-width: var(--lg-scrollbar-width)`：它在 WebView2 上是 `thin`，在 WebKit 上是 `auto`。真机 WKWebView 对 `scrollbar-color` 的绘制也不可靠（试过，轨道反而变成暗色宽带）。`scrollbars.spec.ts` 在真实的文件树滚动容器上校验这一点。

**表格菜单**：表格手柄的 `…` 菜单和对齐子菜单按菜单规则做成 regular 玻璃；“行 / 列”切换是分段控件（`--lg-hover` 轨道 + control 滑块）。菜单打开时会测量自身位置，只淡入。

**窗格内的卡片**（如侧栏底部的日历）：不贴边铺满，四周内缩 6px，四个角都用同心圆角（窗格圆角 − 内缩 = 6px）。它是轻轻搁在玻璃上的一张卡：`--lg-card-fill`（上亮下略暗的极淡提亮）加 `--lg-card-shadow`（顶部 1px 镜面线、极淡内轮廓、0.5px 外轮廓阴影和一层柔和短投影）。不画实线边框，不用顶部分隔线，不加模糊（玻璃不嵌套）。要“感觉得到而不是看得见”：试过的两种极端都不对，亮边框加亮填充显得突兀，内凹暗槽显得沉重。

**凸起的活跃项（玻璃珠）**：卡片或列表里的当前项（如“今天”、选中的日期）不用彩色描边框，用一颗凸起的玻璃珠：`--lg-bead-fill`（上亮下略暗的玻璃）加 `--lg-bead-shadow`（顶部镜面线、内轮廓、短投影）。强调色只留在文字上；被用户选中的项再叠一层 `--lg-selected` 色调。层次靠光影而不是颜色。

**文档卡片（L1）**：不透明，阴影抬升。编辑器 iframe 用 `--pane-radius − 1px` 的 `clip-path` 裁切（`--marklyra-frame-radius`）。

**菜单、弹出层（L3 regular）**：内边距 `--lg-popover-padding`，菜单项圆角 `--lg-radius-item`，菜单项之间不画分隔线，分组之间用 1px `--lg-separator` 加上下各 4px 外边距。菜单项悬停用 `--lg-hover`，键盘高亮或当前项用 `--lg-selected`。

**对话框（L3 thick）**：圆角 20px，内边距 ≥ 20px，遮罩 `--lg-scrim`。主按钮是胶囊形强调色背景（`--lg-accent-fill` / `--lg-accent-ink`），次按钮是胶囊形 `--lg-surface-control` 加 `--lg-shadow-control`；破坏性主按钮用 `--lg-danger`，按钮文案写清后果。

**编辑器运行页浮层（L3 regular）**：斜杠菜单、无原生菜单时的右键菜单按菜单规则，只用 `lg-scrim-in`。查找栏是贴在文档窗格顶边、横跨窗口的条带，宿主按矩形把它露出在侧栏之上，所以保持直角，只换材质、底边和投影。桌面端右键菜单是系统原生菜单，不受 CSS 控制。

**提示、通知（L3 regular）**：右下角浮出，用 `lg-materialize-up`，圆角 14px。

**悬浮控件（clear）**：圆形或胶囊，`--lg-shadow-control`，按下时 `scale: var(--lg-press-scale)`。

**输入框**：底色 `--lg-surface-control`，边 `--lg-edge`，圆角 8px；聚焦时 `0 0 0 3px` 的强调色 18% 光环，不改边框粗细。

**分段控件、开关**：轨道是 `--lg-hover` 色的胶囊；滑块和旋钮用 `--lg-surface-control` 加 `--lg-shadow-control`，跟随选中项移动，使用 `--lg-ease-spring`。

**标题栏**：Windows 的 Web 标题栏和 macOS 的 AppKit 标题栏都铺画布光场。标题栏按钮圆角 6px，悬停用 `--lg-hover`。不给标题栏按钮加玻璃胶囊：macOS 的原生附件视图做不到，加了两端就不一致。

**滚动边缘**：内容会滚到粘性头部下方时，头部用渐隐遮罩（`mask-image` 从不透明渐变到透明），不用实色分隔线。静止状态（滚动位置为 0）下不应出现渐隐。

## 7. 无障碍

| 系统设置 | 处理 |
| --- | --- |
| 降低透明度 | 所有 `--lg-fill-*` 变为不透明，`--lg-filter-*` 变为 `none`，sheen 去掉。WebView2 通过 `prefers-reduced-transparency` 自动生效；**WKWebView 不支持这个媒体查询**（WebKit bug 175497，截至 Safari 27.2 仍未实现），需要宿主读取 `NSWorkspace.accessibilityDisplayShouldReduceTransparency` 后在根元素上设置 `data-transparency="reduced"`，见 §11 |
| 增强对比度 | `prefers-contrast: more`（两端都支持）：轮廓与分隔线加深到 30%–50%，填充接近不透明，去掉 sheen 和环境光 |
| 减弱动态效果 | `prefers-reduced-motion`：时长归零，按下不形变，关键帧只剩淡入 |
| 不支持 backdrop-filter | `@supports not` 回落到不透明填充 |

文字对比度：玻璃上的正文与填充色的对比度不低于 4.5:1，次要文字不低于 3:1。regular 和 thick 填充在白底和 `#0d1117` 底上都满足这一条。clear 只用于图标控件，不承载正文。

## 8. 性能预算

- 同一时刻启用 backdrop-filter 的元素不超过 4 个。不要给列表行、滚动容器里的子元素或高频重绘的元素加 backdrop-filter。
- 玻璃不嵌套：已经是玻璃的浮层，里面的子元素不再加 backdrop-filter。Chromium 会把外层当作 backdrop root，内层只能模糊到外层，效果不对，开销也加倍。
- 窗格类大面积表面不用 backdrop-filter（§4）。
- 动画只改 `opacity`、`scale`、`translate`，全部在合成线程完成。

## 9. 禁止事项

- 在文档正文、代码块、表格、设置内容卡里用玻璃。
- 给多个相邻控件都涂强调色背景。
- 在组件里直接写 `rgba(...)` 阴影或 `blur(...)`。新的需求先加 token。
- 只做 macOS 或只做 Windows 的材质分支。
- 用说明文字解释层级。层级交给材质、阴影和间距表达。

## 10. 落地清单

新组件或改旧组件时：

1. 先判断它在哪一层（§3）。内容层不用玻璃。
2. 从 §4 选材质，照 §4 的标准写法填 token。
3. 圆角按同心规则从 §5 选。
4. 出现动画用 `lg-materialize*`，按下用 `--lg-press-scale`。
5. 在浅色、深色、增强对比度、降低透明度四种状态下截图检查。浏览器测试要覆盖 Chromium（代表 WebView2）和 WebKit（代表 WKWebView）。

## 11. 后续项（需另行确认）

- **macOS 降低透明度信号**：宿主新增只读查询，读取 `accessibilityDisplayShouldReduceTransparency` 并监听变化，再同步到 `data-transparency`。这一项涉及新增 IPC 命令和权限面，单独评审。
- **原生窗口材质**：如果将来希望透过窗口看到桌面，可以评估 macOS 的 `NSGlassEffectView`（macOS 26）或 `NSVisualEffectView`，以及 Windows 11 的 Mica。前提是两端效果能对齐，并接受透明窗口带来的 `macOSPrivateApi` 和 Windows 10 回落问题。

## 参考

- Apple HIG — [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Color · Liquid Glass color](https://developer.apple.com/design/human-interface-guidelines/color)、[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- Apple — [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [liquidglass.dev](https://liquidglass.dev/)：各引擎对 `backdrop-filter: url()` 的支持矩阵
- [Liquid Glass Studio](https://liquid-glass-studio.vercel.app/)：光学参数（fresnel、glare 角 −45°、阴影扩散）的取值参考
- [caniuse: prefers-reduced-transparency](https://caniuse.com/mdn-css_at-rules_media_prefers-reduced-transparency)
