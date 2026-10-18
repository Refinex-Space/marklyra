use serde::{Deserialize, Serialize};

pub const MAX_FORMAT_BYTES: usize = 8 * 1024 * 1024;
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Content {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mark_html: Option<String>,
}
impl Content {
    pub(super) fn validate(&self) -> Result<(), String> {
        for value in std::iter::once(&self.text)
            .chain(self.html.iter())
            .chain(self.mark_html.iter())
        {
            if value.len() > MAX_FORMAT_BYTES || value.contains('\0') {
                return Err("剪贴板内容超过每格式 8 MiB 限制或含有无法保留的空字符".to_owned());
            }
        }
        Ok(())
    }
}
