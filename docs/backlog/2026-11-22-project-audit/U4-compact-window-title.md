# U4 Windows 窄窗口隐藏文档名和重命名入口

**P3 · 体验缺陷** · [返回任务索引](README.md)

## 现状

在 Windows 模拟宿主打开已保存的 `Launch.md`，保留左侧栏，将窗口缩到配置允许的 700 px 宽。编辑区仍可用，但标题栏的文档名和标题上的重命名入口消失。现有布局在留给居中标题的空间不足时移除整个标题节点，节点也承载未保存标记。[窗口配置](../../../apps/desktop/src-tauri/tauri.windows.conf.json#L5) · [标题宽度计算](../../../apps/desktop/src/components/Titlebar.tsx#L115) · [标题控件](../../../apps/desktop/src/components/Titlebar.tsx#L214)

## 验收

- 在 700 px、侧栏打开时，仍能识别当前文档，查看未保存状态并访问重命名入口。
- 长文件名可以截断，完整名称可获取。标题、主要操作与系统窗口按钮不重叠。
- 检查 700 px 和常规宽度下的布局，Windows 原生标题栏交互另记实机结果。[Windows 标题栏浏览器测试](../../../tests/desktop-e2e/windows-titlebar.spec.ts)
