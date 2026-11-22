# U1 快速打开里无法区分部分同名笔记

**P2 · 体验缺陷** · [返回任务索引](README.md)

## 现状

先后打开 `/One/Clients/Website/Launch.md` 和 `/Two/Clients/Website/Launch.md`，再从快速打开查找 `Launch`。两个结果均显示 `Launch · Clients › Website`，悬停也无法看到完整路径。用户只能打开后确认选的是哪一篇。

近期笔记在工作区外时只显示路径末尾的两个目录。结果行也没有用于查看完整路径的说明。[笔记结果构建](../../../apps/desktop/src/features/quick-open/quick-sources.ts#L148) · [结果行](../../../apps/desktop/src/features/quick-open/QuickOpen.tsx#L169)

## 验收

- 重名且短路径相同的结果显示足以区分来源的路径片段。
- 鼠标和键盘用户都能获取完整路径。窄窗口仍能辨认重名项。
- 两个结果分别打开对应的文件。普通结果继续使用简洁的路径展示。[快速打开浏览器测试](../../../tests/desktop-e2e/home-quick-open.spec.ts)
