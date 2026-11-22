# B4 同一周显示两个周数

**P3 · Bug** · [返回任务索引](README.md)

## 复现

设置每周从周日开始并显示周数，将日期固定为 2026-11-22。打开侧栏周视图。标题显示「本周 · 第47周」，显示 22 至 28 日的表格行标为「48」。

标题按当天计算 ISO 周数，表格按该行的周一计算 ISO 周数。周日正好落在两个结果的交界处。[周视图标题](../../../apps/desktop/src/features/calendar/CalendarPanel.tsx#L145) · [表格行周数](../../../apps/desktop/src/features/calendar/calendar-dates.ts#L99)

## 验收

- 复现日期下，标题和表格行使用同一个周标识，仍显示 22 至 28 日，且保留「本周」提示。
- 切到上一周、下一周以及跨年周时，标题和表格行保持一致。周一作为每周第一天时，周数继续正确。[日历单测](../../../apps/desktop/test/calendar.test.ts)
