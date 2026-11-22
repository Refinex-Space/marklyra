# U3 站点搜索框拦住正反向 Tab

**P2 · 体验缺陷** · [返回任务索引](README.md)

## 现状

站点导航配置两个及以上搜索引擎时，聚焦搜索框，依次按 Tab、Tab、Shift+Tab。实测引擎在必应和 Google 间切换，焦点始终留在搜索框。键盘用户无法用常规 Tab 顺序前往下一个或上一个控件。[键盘处理](../../../apps/desktop/src/features/sites/SearchBox.tsx#L185)

## 验收

- 搜索框内按 Tab 和 Shift+Tab，焦点按常规顺序离开输入框。
- 搜索引擎切换仍可用键盘完成，界面提示与实际按键一致。
- 键盘能继续操作搜索建议和回车提交，输入法组字期间不误触发搜索。[站点浏览器测试](../../../tests/desktop-e2e/sites.spec.ts)
