# @marklyra/editor-runtime

通过独立 origin 的运行页面提供浏览器编辑器实例。宿主负责文件访问、编码、原生窗口与实际持久化。

```ts
import { MarkLyraEditor } from '@marklyra/editor-runtime';

const editor = new MarkLyraEditor(container, {
  runtimeUrl: 'http://127.0.0.1:4174/index.html',
  markdown: '# MarkLyra\n',
});
await editor.ready;
const source = await editor.flush();
// 在宿主成功保存 source 后，再调用 await editor.markSaved(source)。
editor.destroy();
```

通过 `load` 切换文稿，`execute` 执行类型化命令。`getMarkdown` 是缓存，不能替代保存前的 `flush`；同步失败时保留当前文稿并报告错误。React 适配位于 `@marklyra/editor-react`，不得逐次输入重建实例。详细接口以导出的 TypeScript 声明为准。

编辑器引擎、主题和字体源码位于仓库的 `resources/editor`，运行页面生成到 `dist/editor-runtime`。SDK 归档只包含适配层，桌面构建会另行打包生成的运行页面。
