//! Cycles and templates. Cycle dates are local calendar days supplied by the client, so the
//! store never guesses a time zone; `started` and `cycle_added` are UTC instants that only
//! need to be compared with each other.
use super::{
    compose, config::slug_for, create_sub, fm, invalid, mapping, now_iso, open_sub, read_text,
    revision, valid_due, valid_slug, write_atomic, InvalidFile, MutationResult, Result, StoreError,
    TaskStore, MAX_BODY,
};
use crate::model::{self, priority_from, Cycle, CycleSummary, Template, PRIORITIES};
use serde_json::{json, Map, Value};

// ───────────── 日期 ─────────────

/// Days since 1970-01-01 for a `YYYY-MM-DD` date.
pub(crate) fn day_number(date: &str) -> Option<i64> {
    if !valid_due(date) {
        return None;
    }
    let y: i64 = date[..4].parse().ok()?;
    let m: i64 = date[5..7].parse().ok()?;
    let d: i64 = date[8..10].parse().ok()?;
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

pub(super) fn day_text(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

/// ISO weekday, 1 Monday … 7 Sunday. 1970-01-01 was a Thursday.
pub(super) fn weekday(days: i64) -> u8 {
    ((days + 3).rem_euclid(7) + 1) as u8
}

/// The cycle containing `today` when cycles start on `start_day`.
pub(super) fn cycle_start(today: i64, start_day: u8) -> i64 {
    today - i64::from((weekday(today) + 7 - start_day) % 7)
}

fn opt_str(v: &Value) -> Option<&str> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty())
}

fn yaml_list(items: &[String]) -> Value {
    if items.is_empty() {
        Value::Null
    } else {
        json!(items)
    }
}

pub(super) fn parse_cycle(number: u32, text: &str) -> std::result::Result<Cycle, String> {
    let map = mapping(text)?;
    let start = model::text(&map, "start").filter(|d| valid_due(d));
    let end = model::text(&map, "end").filter(|d| valid_due(d));
    let (Some(start), Some(end)) = (start, end) else {
        return Err("迭代缺少有效的 start / end 日期".into());
    };
    let state = model::text(&map, "state")
        .filter(|s| matches!(s.as_str(), "active" | "upcoming" | "completed"))
        .unwrap_or_else(|| "upcoming".into());
    let summary = (state == "completed").then(|| CycleSummary {
        planned: model::number(&map, "planned").map_or(0, |n| n.max(0.0) as u32),
        added: model::number(&map, "added").map_or(0, |n| n.max(0.0) as u32),
        completed: model::list(&map, "completed_tasks"),
        cancelled: model::list(&map, "cancelled_tasks"),
        unfinished: model::list(&map, "unfinished_tasks"),
    });
    Ok(Cycle {
        number,
        name: model::text(&map, "name"),
        start,
        end,
        state,
        started: model::text(&map, "started"),
        completed_at: model::text(&map, "completed_at"),
        summary,
        revision: revision(text),
    })
}

fn parse_template(id: &str, text: &str) -> std::result::Result<Template, String> {
    let map = mapping(text)?;
    Ok(Template {
        id: id.into(),
        name: model::text(&map, "name").unwrap_or_else(|| id.into()),
        title: model::text(&map, "title").unwrap_or_default(),
        status: model::text(&map, "status"),
        priority: priority_from(map.get("priority")),
        kind: model::text(&map, "type"),
        labels: model::list(&map, "labels"),
        bucket: model::text(&map, "bucket"),
        subtasks: model::list(&map, "subtasks"),
        description: fm::body(text).to_owned(),
        order: model::number(&map, "order").unwrap_or(0.0),
        revision: revision(text),
    })
}

impl TaskStore {
    pub(super) fn read_cycles(&self, invalid: &mut Vec<InvalidFile>) -> Result<Vec<Cycle>> {
        let Some(sub) = open_sub(&self.dir, "cycles")? else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for entry in sub.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(number) = name
                .strip_suffix(".md")
                .filter(|n| !n.is_empty() && n.len() <= 6 && n.bytes().all(|b| b.is_ascii_digit()))
                .and_then(|n| n.parse::<u32>().ok())
                .filter(|n| *n > 0)
            else {
                continue;
            };
            match read_text(&sub, &name)
                .map_err(|e| e.to_string())
                .and_then(|t| parse_cycle(number, &t))
            {
                Ok(c) => out.push(c),
                Err(error) => invalid.push(InvalidFile {
                    path: format!("cycles/{name}"),
                    error,
                }),
            }
        }
        out.sort_by_key(|c| c.number);
        Ok(out)
    }

    pub(super) fn read_templates(&self, invalid: &mut Vec<InvalidFile>) -> Result<Vec<Template>> {
        let Some(sub) = open_sub(&self.dir, "templates")? else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for entry in sub.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(id) = name.strip_suffix(".md").filter(|id| valid_slug(id)) else {
                continue;
            };
            match read_text(&sub, &name)
                .map_err(|e| e.to_string())
                .and_then(|t| parse_template(id, &t))
            {
                Ok(t) => out.push(t),
                Err(error) => invalid.push(InvalidFile {
                    path: format!("templates/{name}"),
                    error,
                }),
            }
        }
        out.sort_by(|a, b| a.order.total_cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    /// A task may join an active or upcoming cycle; finished ones are history.
    pub(super) fn check_cycle(&self, number: u32) -> Result<()> {
        match self.cycles.iter().find(|c| c.number == number) {
            None => Err(StoreError::NotFound("迭代")),
            Some(c) if c.state == "completed" => invalid(format!("迭代 {number} 已完成")),
            Some(_) => Ok(()),
        }
    }

    fn write_cycle(&self, number: u32, changes: &[(String, Value)]) -> Result<()> {
        let dir = create_sub(&self.dir, "cycles")?;
        let name = format!("{number}.md");
        let text = match super::read_optional(&dir, &name)? {
            Some(t) => t,
            None => "---\n---\n".into(),
        };
        write_atomic(&dir, &name, &fm::patch(&text, changes))
    }

    /// Keeps one active and one upcoming cycle once cycles are on. `today` is the client's
    /// local date; a new first cycle starts on the latest start day not after it.
    pub(super) fn ensure_cycles(&mut self, today: &str) -> Result<()> {
        let today = day_number(today).ok_or_else(|| StoreError::Invalid("日期无效".into()))?;
        let weeks = i64::from(self.settings.cycle_weeks.clamp(1, 4));
        let length = weeks * 7;
        if !self.cycles.iter().any(|c| c.state == "active") {
            let now = now_iso();
            if let Some(next) = self.cycles.iter().find(|c| c.state == "upcoming") {
                self.write_cycle(
                    next.number,
                    &[
                        ("state".into(), json!("active")),
                        ("started".into(), json!(now)),
                    ],
                )?;
            } else {
                let number = self.cycles.last().map_or(1, |c| c.number + 1);
                let start = cycle_start(today, self.settings.cycle_start_day.clamp(1, 7));
                self.write_cycle(
                    number,
                    &[
                        ("start".into(), json!(day_text(start))),
                        ("end".into(), json!(day_text(start + length - 1))),
                        ("state".into(), json!("active")),
                        ("started".into(), json!(now)),
                    ],
                )?;
            }
            self.refresh()?;
        }
        let active = self
            .cycles
            .iter()
            .find(|c| c.state == "active")
            .cloned()
            .ok_or(StoreError::NotFound("迭代"))?;
        let after = day_number(&active.end).unwrap_or(today) + 1;
        match self.cycles.iter().find(|c| c.number == active.number + 1) {
            Some(next) if next.state == "upcoming" => {
                // A changed length applies to cycles that have not started.
                let end = day_text(after + length - 1);
                if next.start != day_text(after) || next.end != end {
                    self.write_cycle(
                        next.number,
                        &[
                            ("start".into(), json!(day_text(after))),
                            ("end".into(), json!(end)),
                        ],
                    )?;
                }
            }
            Some(_) => {}
            None => self.write_cycle(
                active.number + 1,
                &[
                    ("start".into(), json!(day_text(after))),
                    ("end".into(), json!(day_text(after + length - 1))),
                    ("state".into(), json!("upcoming")),
                ],
            )?,
        }
        self.refresh()?;
        Ok(())
    }

    /// Freezes the summary, moves unfinished tasks (to the next cycle unless told `none`),
    /// starts the next cycle and lines up the one after it.
    pub(super) fn complete_cycle(
        &mut self,
        number: u32,
        moves: &Map<String, Value>,
        today: &str,
        result: &mut MutationResult,
    ) -> Result<()> {
        let cycle = self
            .cycles
            .iter()
            .find(|c| c.number == number)
            .cloned()
            .ok_or(StoreError::NotFound("迭代"))?;
        if cycle.state != "active" {
            return invalid("只能完成进行中的迭代");
        }
        let started = cycle
            .started
            .clone()
            .unwrap_or_else(|| format!("{}T00:00:00Z", cycle.start));
        let mut summary = CycleSummary::default();
        let mut tasks: Vec<_> = self
            .tasks()
            .filter(|t| t.cycle == Some(number) && !t.archived)
            .cloned()
            .collect();
        tasks.sort_by(|a, b| a.order.total_cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
        for t in &tasks {
            if t.cycle_added
                .as_deref()
                .is_none_or(|a| a <= started.as_str())
            {
                summary.planned += 1;
            } else {
                summary.added += 1;
            }
            match self.status(&t.status).map(|s| s.category) {
                Some(crate::Category::Completed) => summary.completed.push(t.id.clone()),
                Some(crate::Category::Cancelled) => summary.cancelled.push(t.id.clone()),
                _ => summary.unfinished.push(t.id.clone()),
            }
        }
        for (id, to) in moves {
            if !summary.unfinished.contains(id) {
                return invalid("只能安排本迭代未完成的任务");
            }
            if !matches!(to.as_str(), Some("next" | "none")) {
                return invalid("去向应为 next 或 none");
            }
        }
        let now = now_iso();
        let next = number + 1;
        let next_exists = self.cycles.iter().any(|c| c.number == next);
        let after = day_number(&cycle.end).unwrap_or(0) + 1;
        let length = i64::from(self.settings.cycle_weeks.clamp(1, 4)) * 7;
        let mut next_changes = vec![
            ("state".into(), json!("active")),
            ("started".into(), json!(now)),
        ];
        if !next_exists {
            next_changes.push(("start".into(), json!(day_text(after))));
            next_changes.push(("end".into(), json!(day_text(after + length - 1))));
        }
        let items = open_sub(&self.dir, "items")?;
        for id in &summary.unfinished {
            let to_next = moves.get(id).and_then(Value::as_str) != Some("none");
            let changes = vec![
                (
                    "cycle".to_owned(),
                    if to_next { json!(next) } else { Value::Null },
                ),
                (
                    "cycle_added".to_owned(),
                    if to_next { json!(now) } else { Value::Null },
                ),
            ];
            if let Some(items) = &items {
                let name = format!("{id}.md");
                let text = read_text(items, &name)?;
                write_atomic(items, &name, &fm::patch(&text, &changes))?;
            }
            self.log(
                id,
                json!({
                    "type": "cycle",
                    "from": number,
                    "to": if to_next { json!(next) } else { Value::Null },
                }),
            )?;
            result.applied.push(id.clone());
        }
        self.write_cycle(
            number,
            &[
                ("state".into(), json!("completed")),
                ("completed_at".into(), json!(now)),
                ("planned".into(), json!(summary.planned)),
                ("added".into(), json!(summary.added)),
                ("completed_tasks".into(), yaml_list(&summary.completed)),
                ("cancelled_tasks".into(), yaml_list(&summary.cancelled)),
                ("unfinished_tasks".into(), yaml_list(&summary.unfinished)),
            ],
        )?;
        self.write_cycle(next, &next_changes)?;
        self.refresh()?;
        self.ensure_cycles(today)?;
        result.applied.push(format!("cycle:{number}"));
        Ok(())
    }

    pub(super) fn save_template(
        &mut self,
        id: Option<&str>,
        set: &Map<String, Value>,
        result: &mut MutationResult,
    ) -> Result<()> {
        let mut changes: Vec<(String, Value)> = Vec::new();
        let mut body = None;
        for (key, value) in set {
            match key.as_str() {
                "name" => {
                    let n = opt_str(value).unwrap_or("");
                    if n.is_empty() || n.chars().count() > 40 {
                        return invalid("模板名称不能为空，且不超过 40 个字符");
                    }
                    if self
                        .templates
                        .iter()
                        .any(|t| t.name == n && Some(t.id.as_str()) != id)
                    {
                        return invalid(format!("「{n}」已存在"));
                    }
                    changes.push(("name".into(), json!(n)));
                }
                "title" => {
                    let t = value.as_str().unwrap_or("");
                    if t.chars().count() > 500 {
                        return invalid("标题不超过 500 个字符");
                    }
                    let t = t.trim();
                    changes.push((
                        "title".into(),
                        if t.is_empty() { Value::Null } else { json!(t) },
                    ));
                }
                "status" => {
                    if let Some(s) = opt_str(value) {
                        if self.status(s).is_none() {
                            return invalid("未知状态");
                        }
                    }
                    changes.push((
                        "status".into(),
                        opt_str(value).map_or(Value::Null, |s| json!(s)),
                    ));
                }
                "priority" => {
                    let p = value.as_u64().filter(|p| *p <= 4).unwrap_or(0) as usize;
                    changes.push((
                        "priority".into(),
                        if p == 0 {
                            Value::Null
                        } else {
                            json!(PRIORITIES[p])
                        },
                    ));
                }
                "type" => {
                    if let Some(t) = opt_str(value) {
                        if !self.types.iter().any(|x| x.id == t) {
                            return invalid("未知类型");
                        }
                    }
                    changes.push((
                        "type".into(),
                        opt_str(value).map_or(Value::Null, |s| json!(s)),
                    ));
                }
                "bucket" => {
                    if let Some(b) = opt_str(value) {
                        if !self.buckets.iter().any(|x| x.id == b) {
                            return invalid("未知队列");
                        }
                    }
                    changes.push((
                        "bucket".into(),
                        opt_str(value).map_or(Value::Null, |s| json!(s)),
                    ));
                }
                "labels" | "subtasks" => {
                    let list: Vec<String> = value
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v.as_str().map(str::trim).filter(|s| !s.is_empty()))
                        .map(String::from)
                        .collect();
                    if key == "labels" {
                        self.check_labels(&list)?;
                    } else if list.len() > 50 || list.iter().any(|s| s.chars().count() > 500) {
                        return invalid("子任务最多 50 个，每个不超过 500 个字符");
                    }
                    changes.push((key.clone(), yaml_list(&list)));
                }
                "description" => {
                    let d = value.as_str().unwrap_or("");
                    if d.len() > MAX_BODY {
                        return invalid("描述超过 512 KiB");
                    }
                    body = Some(d.to_owned());
                }
                other => return invalid(format!("不支持修改字段 {other}")),
            }
        }
        // A new file reads name first; edits keep the file's own key order.
        changes.sort_by_key(|(k, _)| k != "name");
        let dir = create_sub(&self.dir, "templates")?;
        let (slug, text) = match id {
            Some(id) => {
                if !self.templates.iter().any(|t| t.id == id) {
                    return Err(StoreError::NotFound("模板"));
                }
                let name = format!("{id}.md");
                (id.to_owned(), read_text(&dir, &name)?)
            }
            None => {
                let display = changes
                    .iter()
                    .find(|(k, _)| k == "name")
                    .and_then(|(_, v)| v.as_str())
                    .ok_or_else(|| StoreError::Invalid("模板名称不能为空".into()))?
                    .to_owned();
                let slug = slug_for(&display, |s| self.templates.iter().any(|t| t.id == s));
                changes.push(("order".into(), json!(self.templates.len() + 1)));
                result.created.push(slug.clone());
                (slug, compose(&[], ""))
            }
        };
        let mut out = fm::patch(&text, &changes);
        if let Some(b) = body {
            out = fm::with_body(&out, &b);
        }
        if out != text {
            write_atomic(&dir, &format!("{slug}.md"), &out)?;
        }
        result.applied.push(slug);
        Ok(())
    }

    /// Projects that used the template as their default fall back to none.
    pub(super) fn delete_template(&mut self, id: &str, result: &mut MutationResult) -> Result<()> {
        if !self.templates.iter().any(|t| t.id == id) {
            return Err(StoreError::NotFound("模板"));
        }
        if let Some(dir) = open_sub(&self.dir, "projects")? {
            for p in self
                .projects
                .iter()
                .filter(|p| p.default_template.as_deref() == Some(id))
            {
                let name = format!("{}.md", p.id);
                let text = read_text(&dir, &name)?;
                write_atomic(
                    &dir,
                    &name,
                    &fm::patch(&text, &[("default_template".into(), Value::Null)]),
                )?;
            }
        }
        open_sub(&self.dir, "templates")?
            .ok_or(StoreError::NotFound("模板"))?
            .remove_file(format!("{id}.md"))?;
        result.applied.push(id.into());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_round_trip_across_month_year_and_leap_boundaries() {
        for d in [
            "1970-01-01",
            "2024-02-29",
            "2024-03-01",
            "2026-12-31",
            "2027-01-01",
        ] {
            assert_eq!(day_text(day_number(d).unwrap()), d);
        }
        assert_eq!(
            day_number("2026-03-01").unwrap() - day_number("2026-02-28").unwrap(),
            1
        );
        assert_eq!(
            day_number("2024-03-01").unwrap() - day_number("2024-02-28").unwrap(),
            2
        );
    }

    #[test]
    fn cycles_start_on_the_chosen_weekday() {
        // 2026-11-10 is a Tuesday.
        let tue = day_number("2026-11-10").unwrap();
        assert_eq!(weekday(tue), 2);
        assert_eq!(day_text(cycle_start(tue, 1)), "2026-11-09");
        assert_eq!(day_text(cycle_start(tue, 2)), "2026-11-10");
        assert_eq!(day_text(cycle_start(tue, 7)), "2026-11-08");
        // A Monday start across a year boundary.
        let fri = day_number("2027-01-01").unwrap();
        assert_eq!(day_text(cycle_start(fri, 1)), "2026-12-28");
    }
}
