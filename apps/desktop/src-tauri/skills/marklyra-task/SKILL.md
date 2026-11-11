---
name: marklyra-task
description: Manage MarkLyra workspace tasks — query, create, update, complete, comment, archive and restore tasks; organize them with projects, statuses, labels, types, buckets, cycles (sprints), due dates, subtasks and blockers; import checklists and exports. Use when the user mentions MarkLyra tasks, a task reference such as WEB-12, a .marklyra/tasks folder, or asks to plan, triage or schedule work in a MarkLyra workspace. 管理 MarkLyra 任务：查询、新建、更新、完成、评论、归档、项目、迭代与排期。
metadata:
  generator: marklyra
---

# MarkLyra 任务

MarkLyra 把任务存成工作区里 `.marklyra/tasks/` 下的 Markdown + YAML 文件。应用、`marklyra` 命令行和 MCP 工具共用同一套存储代码：每次写入都校验 revision，打开的应用窗口会自动刷新。**不要直接编辑 `.marklyra/tasks` 里的文件**，只通过下面的接口读写。

## 选择接口

1. 当前会话里有 `task_query`、`task_get`、`task_catalog`、`task_create`、`task_propose`、`task_update`、`task_comment`、`task_archive`、`task_restore` 工具（MarkLyra AI 面板，或已连接 `marklyra mcp` 的客户端，名称可能带 MCP 服务前缀）时，**优先使用这些工具**。AI 面板里的写入会弹出确认卡片，由用户勾选后才生效；被拒绝时不要重试，询问用户。
2. 否则使用 `marklyra` 命令行，并总是加 `--json`。找不到命令时依次尝试：
   - macOS / Linux：`~/.local/bin/marklyra`
   - Windows：`%LOCALAPPDATA%\MarkLyra\bin\marklyra.cmd`
   - 仍不可用：请用户在 MarkLyra 的「任务设置 → 智能体技能」或应用菜单「安装命令行工具…」中安装，不要自行下载或改 PATH。

工作区默认从当前目录向上查找 `.marklyra/tasks`；不在工作区内时加 `--workspace <目录>`。只有用户明确要求为某个文件夹启用任务时才运行 `marklyra task init`。

## 工作方式

- 先读后写：写入前用 `task list` / `task show`（或 `task_query` / `task_get`）拿到任务引用和 `revision`；用 `task_catalog` 或 `view list`、`project list` 确认可用的状态、标签、项目名，不要猜。
- 用任务引用（如 `WEB-12`）指代任务，回复时也写引用和标题。
- revision 冲突（退出码 4，或「已在别处修改」）说明任务刚被改过：重新读取，确认改动仍然合理后再写一次。
- 批量修改（超过几项）先列出计划让用户确认；在 AI 面板里用一次 `task_propose` 提交（最多 50 项）。
- 任务从不删除：用户说「删除」时用归档（archive），并告诉用户可以恢复（restore）。
- 完成父任务前检查子任务；命令行会拒绝留下未完成的子任务，确认用户同意后再加 `--close-subtasks`。
- 结束时说明实际改了什么（引用、字段前后值），以及没做成的部分。

## 命令行速查

JSON 输出统一为 `{"ok":true,"schemaVersion":1,"data":…}`；失败为 `{"ok":false,"error":{"code":N,"message":"…"}}`。退出码：0 成功，1 读写失败，2 用法错误，3 未找到，4 revision 冲突，5 校验失败。

### 任务

```sh
marklyra task list [查询…] [--view <视图ID或名称>] [--limit N] [--fields ref,title,statusName,priority,due,revision] --json
marklyra task show WEB-12 --json          # 含描述、最近评论、活动、子任务、revision
marklyra task create "标题" [--project WEB] [--status 待办] [--priority high] [--type 缺陷] \
  [--label 标签]… [--bucket 现在] [--cycle current] [--due 2026-12-01] [--parent WEB-3] \
  [--blocked-by WEB-4,WEB-5] [--related WEB-6] [--description "Markdown"] [--subtask "子任务"]… [--template 模板] --json
marklyra task update WEB-12 [--revision R] [--title …] [create 的任一字段] [--close-subtasks] --json
marklyra task comment WEB-12 "评论内容" --json
marklyra task archive WEB-12 [--revision R] --json
marklyra task restore WEB-12 [--revision R] --json
```

- 完成任务：`task update WEB-12 --status done`（状态可写 ID 或名称，如 `已完成`）；取消用 `cancelled`。
- 清空可空字段写 `none`：`--project none`、`--due none`、`--parent none`、`--cycle none`、`--type none`、`--bucket none`；`--label none` 清空标签，`--blocked-by none` 清空阻塞。
- `--label` 可重复，**替换**整个标签列表；保留原标签需要把原有的一起写上。`--description` 替换整段描述。
- 未给 `--revision` 时，命令行使用刚读到的最新 revision；需要防止覆盖并发修改时显式传入读到的值。
- 优先级：`urgent`、`high`、`medium`、`low`、`none`（也接受 0–4 或 紧急/高/中/低）。

### 项目、迭代、视图

```sh
marklyra project list --json                          # key、名称、状态、未关闭任务数
marklyra project show WEB --json
marklyra project create "网站" --key WEB [--color blue] [--description …] --json   # key：2–5 位大写字母或数字，字母开头
marklyra project update WEB [--name …] [--key …] [--color …] [--state …] [--description …] --json
marklyra project archive|restore WEB --json

marklyra cycle list --json                            # 需先在应用的任务设置中开启迭代
marklyra cycle show 3 --json
marklyra cycle complete 3 [--move next|none] --json   # 未完成任务移到下一迭代或移出

marklyra view list --json
marklyra view show 全部未完成 --json
```

### 导入

```sh
marklyra import github|csv <文件> [--project WEB] [--create-labels] [--include-closed] [--dry-run] --json
marklyra import octarine <目录> [同上]
marklyra import notes [文件或文件夹] [同上]   # 笔记中的 - [ ] 清单项建为任务，并把该行改为任务链接
marklyra import list --json
marklyra import undo <记录ID> --json        # 归档该次导入新建的任务
```

导入前先 `--dry-run` 给用户看预览；`import notes` 会改写笔记，执行前确认。

## 查询语言

`task list` 的参数、`--view` 的视图和 `task_query` 的 `query` 都使用同一种查询语言。条件之间是「且」，同一键用逗号分隔表示「或」，前缀 `-` 表示排除，值含空格时加引号，其余文字做标题/描述全文匹配。

| 键 | 取值 |
| --- | --- |
| `status:` | 状态 ID 或名称，或分类 `backlog`、`unstarted`、`started`、`review`、`completed`、`cancelled` |
| `priority:` | `urgent`、`high`、`medium`、`low`、`none` 或 0–4 |
| `label:` `type:` `bucket:` | ID 或名称；`type:none`、`bucket:none` |
| `project:` | 项目 key、ID 或名称；`project:none` |
| `cycle:` | `current`、`next`、`previous`、数字、`none` |
| `is:` | `open`、`closed`、`overdue`、`blocked`、`parent`、`subtask`、`archived` |
| `has:` | `due`、`labels`、`description`、`comments`、`subtasks`、`parent`、`priority`、`type`、`bucket`、`cycle`、`relations` |
| `due:` | `today`、`week`、`overdue`、`<7d`、`>2w`、`none` |
| `created:` `completed:` | `<3d`、`>1w`、`<12h`、`<1m` |

中文键名同样有效（`状态:`、`优先级:`、`项目:`…）。归档任务只在 `is:archived` 时出现。

示例：

- 本周到期且未完成：`is:open due:<7d -due:overdue`
- 某项目里的紧急缺陷：`is:open project:WEB priority:urgent,high label:缺陷`
- 当前迭代的阻塞项：`cycle:current is:blocked`
- 最近一周完成：`completed:<7d`

## 常见请求

- 「我今天该做什么」：`task list "is:open due:today" --json`，再看 `is:overdue` 和 `priority:urgent`，按优先级与到期日给出简短清单。
- 「把 X 拆成几个任务」：先 `project list` 确认项目，再一次 `task create … --subtask …`，或在 AI 面板用 `task_propose`。
- 「排期 / 安排到下个迭代」：`task update WEB-12 --cycle next` 或 `--due 2026-12-01`；迭代未开启时请用户在任务设置里开启。
- 「标记完成」：`task update WEB-12 --status done`，有子任务时先确认。
- 「删掉这个任务」：`task archive WEB-12`，说明可恢复。
