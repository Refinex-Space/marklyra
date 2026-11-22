# B2 快速打开在加载结果时换掉选中项

**P1 · Bug** · [返回任务索引](README.md)

## 复现

1. 从首页打开「快速打开 → 全部」，让笔记列表请求延后返回。
2. 用方向键把高亮移到「新建窗口」。笔记结果返回后，高亮变成了 `Launch.md`。
3. 按 Enter，实际打开了这篇笔记。

选中状态保存的是结果数组下标。笔记组插到操作组之前后，相同下标指向另一条结果。[选中与执行](../../../apps/desktop/src/features/quick-open/QuickOpen.tsx#L38) · [结果分组](../../../apps/desktop/src/features/quick-open/quick-open-model.ts#L130)

## 验收

- 在笔记加载前选中的操作仍存在时，结果到达后保持高亮、滚动定位和 `aria-activedescendant` 指向同一个操作。Enter 执行该操作。
- 当前选中项消失时，Enter 不误执行排到旧位置上的其他条目。方向键可以重新选中结果。
- 用可延迟的笔记请求复现，断言实际创建窗口的调用和未发生的文档打开调用。[快速打开浏览器测试](../../../tests/desktop-e2e/home-quick-open.spec.ts)
