use serde::Deserialize;
use std::collections::HashSet;

// Newly defined SDK protocol identifiers, not runtime native selectors.
pub const ACTIONS: &[&str] = &[
    "edit.copy",
    "edit.cut",
    "edit.paste",
    "edit.pastePlain",
    "edit.copyMarkdown",
    "edit.copyHTML",
    "edit.copySemanticHTML",
    "link.copyAddress",
    "link.open",
    "image.copyAddress",
    "image.reveal",
    "image.open",
    "image.copyToStorage",
    "image.downloadToStorage",
    "image.delete",
    "image.toHTML",
    "image.toMarkdown",
    "image.zoom50",
    "image.zoom100",
    "image.zoom200",
    "table.insertRowBefore",
    "table.insertRowAfter",
    "table.insertColumnBefore",
    "table.insertColumnAfter",
    "table.deleteRow",
    "table.deleteColumn",
    "table.delete",
    "table.moveRowUp",
    "table.moveRowDown",
    "table.moveColumnLeft",
    "table.moveColumnRight",
    "table.copy",
    "table.format",
    "block.insertParagraphBefore",
    "block.insertParagraphAfter",
    "block.edit",
    "block.delete",
    "code.copy",
    "code.format",
    "code.formatSelection",
];

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Request {
    pub request_id: String,
    pub point: Point,
    pub items: Vec<Item>,
}
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Item {
    #[serde(rename = "item")]
    Action {
        #[serde(rename = "actionId")]
        action_id: String,
        label: String,
        enabled: bool,
    },
    Submenu {
        label: String,
        items: Vec<Item>,
    },
    Separator,
}

pub fn valid_request_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}
fn valid_label(label: &str) -> bool {
    !label.is_empty()
        && label.encode_utf16().count() <= 160
        && !label
            .chars()
            .any(|value| value <= '\u{1f}' || value == '\u{7f}')
}
impl Request {
    pub fn validate(&self) -> Result<(), String> {
        if !valid_request_id(&self.request_id)
            || !self.point.x.is_finite()
            || !self.point.y.is_finite()
            || self.point.x.abs() > 100_000.0
            || self.point.y.abs() > 100_000.0
        {
            return Err("无效的右键菜单请求或坐标".to_owned());
        }
        validate_items(&self.items, 0, &mut 0, &mut HashSet::new())
    }
}
fn validate_items<'a>(
    items: &'a [Item],
    depth: usize,
    count: &mut usize,
    actions: &mut HashSet<&'a str>,
) -> Result<(), String> {
    if items.is_empty() || depth > 3 {
        return Err("右键菜单层级无效".to_owned());
    }
    for item in items {
        *count += 1;
        if *count > 80 {
            return Err("右键菜单项过多".to_owned());
        }
        match item {
            Item::Action {
                action_id, label, ..
            } => {
                if !ACTIONS.contains(&action_id.as_str())
                    || !valid_label(label)
                    || !actions.insert(action_id)
                {
                    return Err("右键菜单包含无效或重复动作".to_owned());
                }
            }
            Item::Submenu { label, items } => {
                if !valid_label(label) {
                    return Err("右键子菜单标签无效".to_owned());
                }
                validate_items(items, depth + 1, count, actions)?;
            }
            Item::Separator => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Request {
        Request {
            request_id: "ctx-a-1".into(),
            point: Point { x: 10.0, y: 20.0 },
            items: vec![Item::Action {
                action_id: "edit.copy".into(),
                label: "复制".into(),
                enabled: true,
            }],
        }
    }
    #[test]
    fn action_catalog_matches_the_public_sdk_exactly() {
        let source =
            include_str!("../../../../../packages/editor-runtime/src/context-menu/contracts.ts");
        let source = source
            .split("export const CONTEXT_ACTIONS = [")
            .nth(1)
            .unwrap()
            .split("] as const")
            .next()
            .unwrap();
        let observed: Vec<&str> = source
            .split('\'')
            .enumerate()
            .filter_map(|(index, value)| (index % 2 == 1).then_some(value))
            .collect();
        assert_eq!(observed, ACTIONS);
    }
    #[test]
    fn image_actions_are_registered_without_granting_arbitrary_native_actions() {
        for action in ACTIONS.iter().filter(|action| action.starts_with("image.")) {
            let mut value = request();
            value.items = vec![Item::Action {
                action_id: (*action).into(),
                label: "图片操作".into(),
                enabled: true,
            }];
            assert!(value.validate().is_ok());
        }
        for action in [
            "image.upload",
            "image.moveFile",
            "image.deleteFile",
            "image.run",
        ] {
            let mut value = request();
            value.items = vec![Item::Action {
                action_id: action.into(),
                label: "图片操作".into(),
                enabled: true,
            }];
            assert!(value.validate().is_err());
        }
    }
    #[test]
    fn rejects_arbitrary_actions_duplicates_extra_fields_and_invalid_ids() {
        for id in ["", "a/b", "x;run", "a:b", &"a".repeat(81)] {
            let mut value = request();
            value.request_id = id.into();
            assert!(value.validate().is_err());
        }
        let mut value = request();
        value.items.push(value.items[0].clone());
        assert!(value.validate().is_err());
        value.items = vec![Item::Action {
            action_id: "window.runCommand".into(),
            label: "run".into(),
            enabled: true,
        }];
        assert!(value.validate().is_err());
        assert!(serde_json::from_str::<Item>(
            r#"{"type":"item","actionId":"edit.copy","label":"Copy","enabled":true,"script":"bad"}"#
        )
        .is_err());
    }
    #[test]
    fn validates_unicode_limits_positions_and_bounded_hierarchy() {
        let mut value = request();
        assert!(value.validate().is_ok());
        for x in [f64::NAN, f64::INFINITY, 100_001.0] {
            value.point.x = x;
            assert!(value.validate().is_err());
        }
        value.point.x = 10.0;
        for label in ["x\ny".into(), "😀".repeat(81), "".into()] {
            value.items = vec![Item::Action {
                action_id: "edit.copy".into(),
                label,
                enabled: false,
            }];
            assert!(value.validate().is_err());
        }
        value.items = vec![Item::Separator; 81];
        assert!(value.validate().is_err());
        value = request();
        for _ in 0..4 {
            value.items = vec![Item::Submenu {
                label: "Sub".into(),
                items: value.items,
            }];
        }
        assert!(value.validate().is_err());
    }
}
