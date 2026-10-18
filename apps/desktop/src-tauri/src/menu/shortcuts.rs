/// Platform routing is centralized here. Mac bindings are checked against the
/// shipped MainMenu.nib; Windows keeps its own replacement/fullscreen keys.
pub(super) fn resolve(id: &str, fallback: Option<&'static str>) -> Option<&'static str> {
    match id {
        "replace" => Some(if cfg!(target_os = "macos") {
            "Cmd+Shift+F"
        } else {
            "Ctrl+H"
        }),
        "view:fullscreen" => Some(if cfg!(target_os = "macos") {
            "Cmd+Ctrl+F"
        } else {
            "F11"
        }),
        "view:outline" => Some(if cfg!(target_os = "macos") {
            "Cmd+Ctrl+1"
        } else {
            "Ctrl+Shift+1"
        }),
        "view:articles" => Some(if cfg!(target_os = "macos") {
            "Cmd+Ctrl+2"
        } else {
            "Ctrl+Shift+2"
        }),
        "view:files" => Some(if cfg!(target_os = "macos") {
            "Cmd+Ctrl+3"
        } else {
            "Ctrl+Shift+3"
        }),
        // The archive declares both Find/Replace and Search with Cmd+Shift+F.
        // Until native dispatch is observed, do not silently shadow Replace.
        "view:workspace-search" => {
            if cfg!(target_os = "macos") {
                None
            } else {
                Some("Ctrl+Shift+F")
            }
        }
        "format:code" => Some("Ctrl+Backquote"),
        "format:del" => Some("Ctrl+Shift+Backquote"),
        "format:inline_math" => Some("Ctrl+M"),
        _ => fallback,
    }
}
