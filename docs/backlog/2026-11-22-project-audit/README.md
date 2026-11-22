# 2026-11-22 MarkLyra 巡检任务

巡检基线为 `708776d`，包含上一轮剪贴板焦点修复。共记录 5 个已复现的 Bug 和 5 个体验缺陷。建议先处理 **B1**，再处理 **B2**。每次按编号选一项，验收通过后勾选对应任务。

- **P1** 可能写错数据或执行错操作。
- **P2** 明显影响日常使用。
- **P3** 局部显示、历史反馈或可访问性问题。

## Bug

- [x] **P1** [B1 任务描述勾选写到别的条目](B1-task-checkbox-target.md)
- [x] **P1** [B2 快速打开在加载结果时换掉选中项](B2-quick-open-selection.md)
- [x] **P2** [B3 添加站点时把旧描述保存给新网址](B3-site-preview-description.md)
- [ ] **P3** [B4 同一周显示两个周数](B4-calendar-week-number.md)
- [ ] **P3** [B5 站点打开失败也计入最近打开](B5-site-recent-open.md)

## 体验缺陷

- [ ] **P2** [U1 快速打开里无法区分部分同名笔记](U1-quick-open-path.md)
- [ ] **P2** [U2 Windows 设置显示暂不可用的拖放选项](U2-windows-drop-preferences.md)
- [ ] **P2** [U3 站点搜索框拦住正反向 Tab](U3-site-search-tab.md)
- [ ] **P3** [U4 Windows 窄窗口隐藏文档名和重命名入口](U4-compact-window-title.md)
- [ ] **P3** [U5 任务清单复选框缺少可区分的名称](U5-task-checkbox-name.md)

## 巡检验证

`pnpm check` 通过 1,985 项，`pnpm test:runtime-contracts` 通过 76 项。`cargo test --workspace --lib --bins --locked -- --test-threads=1` 通过 986 项、忽略 5 项。`pnpm lint` 和 `cargo fmt --all -- --check` 通过。

界面样本覆盖首页、快速打开、编辑器、任务、站点和设置。交互通过 `ego-browser` 在本地运行，文件、时序与系统操作使用隔离的宿主测试数据。Windows 真机、原生拖放和屏幕阅读器仍待实机验收。
