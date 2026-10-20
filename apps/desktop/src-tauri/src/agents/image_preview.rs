//! Explicit image copy export/open. No renderer filesystem paths or executable types.
use super::{attachments::Upload, *};
use base64::{engine::general_purpose::STANDARD, Engine};
use cap_std::{ambient_authority, fs::Dir};
use tauri_plugin_dialog::DialogExt;

const MAX_IMAGE_BYTES: usize = 16 * 1024 * 1024;
fn image_bytes(upload: &Upload) -> Result<(Vec<u8>, &'static str), String> {
    if upload.name.is_empty()
        || upload.name.len() > 1024
        || upload.name.contains(['/', '\\'])
        || upload.name.chars().any(char::is_control)
        || upload.data.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4
    {
        return Err("图片名称或大小无效（最多 16 MiB）".into());
    }
    let bytes = STANDARD.decode(&upload.data).map_err(|_| "图片编码无效")?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 16 MiB".into());
    }
    let mime = image_assets::inspect_image(&bytes).map_err(|error| error.to_string())?;
    let extension = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => return Err("仅支持栅格图片副本".into()),
    };
    if mime != upload.mime_type {
        return Err("图片格式与内容不符".into());
    }
    Ok((bytes, extension))
}
pub(super) struct PreviewCopy {
    pub owner: String,
    parent: Dir,
    directory: Dir,
    name: String,
    filename: String,
    path: PathBuf,
}
impl Drop for PreviewCopy {
    fn drop(&mut self) {
        let _ = self.directory.remove_file(&self.filename);
        let _ = self.parent.remove_dir(&self.name);
    }
}
fn preview_copy(
    root: &Path,
    owner: &str,
    bytes: &[u8],
    extension: &str,
) -> Result<PreviewCopy, String> {
    let parent =
        Dir::open_ambient_dir(root, ambient_authority()).map_err(|_| "临时图片目录不可用")?;
    let name = format!("marklyra-image-{}", Uuid::new_v4());
    let path = root.join(&name);
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&path).map_err(|_| "无法创建图片副本目录")?;
    let directory =
        Dir::open_ambient_dir(&path, ambient_authority()).map_err(|_| "无法打开图片副本目录")?;
    let filename = format!("image.{extension}");
    let copy = PreviewCopy {
        owner: owner.into(),
        parent,
        directory,
        name,
        filename: filename.clone(),
        path: path.join(&filename),
    };
    let mut options = cap_std::fs::OpenOptions::new();
    options.create_new(true).write(true);
    let mut file = copy
        .directory
        .open_with(&filename, &options)
        .map_err(|_| "无法创建图片副本")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(cap_std::fs::Permissions::from_std(
            fs::Permissions::from_mode(0o600),
        ))
        .map_err(|_| "无法保护图片副本")?;
    }
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "无法写入图片副本")?;
    Ok(copy)
}
#[tauri::command]
pub async fn agent_preview_image(
    app: AppHandle,
    window: WebviewWindow,
    upload: Upload,
    action: String,
) -> Result<bool, String> {
    if !crate::windows::is_editor(&window)
        || !crate::windows::is_focused(&window).map_err(|error| error.to_string())?
    {
        return Err("图片操作仅允许由当前编辑窗口发起".into());
    }
    if !["save", "open"].contains(&action.as_str()) {
        return Err("图片操作无效".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (bytes, extension) = image_bytes(&upload)?;
        if action == "save" {
            let stem = Path::new(&upload.name)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("image");
            let Some(chosen) = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("保存图片副本")
                .set_file_name(format!("{stem}.{extension}"))
                .add_filter("图片", &[extension])
                .blocking_save_file()
            else {
                return Ok(false);
            };
            let path = chosen.into_path().map_err(|_| "保存路径无效")?;
            if !crate::windows::is_editor(&window) {
                return Err("编辑窗口已关闭".into());
            }
            let selected = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if selected != extension && !(extension == "jpg" && selected == "jpeg") {
                return Err(format!("请使用 .{extension} 图片扩展名"));
            }
            export_service::ExportDestination::authorize(&path)
                .and_then(|destination| destination.write_bytes(&bytes))
                .map_err(|error| error.to_string())?;
        } else {
            let root = std::env::temp_dir()
                .canonicalize()
                .map_err(|_| "临时目录不可用")?;
            let copy = preview_copy(&root, window.label(), &bytes, extension)?;
            open::that(&copy.path).map_err(|_| "无法用默认应用打开图片副本")?;
            let state = app.state::<AgentHostState>();
            let mut copies = state
                .image_previews
                .lock()
                .map_err(|_| "图片副本状态不可用")?;
            copies.push(copy);
            if copies.len() > 8 {
                copies.remove(0);
            }
        }
        Ok(true)
    })
    .await
    .map_err(|_| "图片操作未完成".to_owned())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepted_png_keeps_exact_bytes_and_mime_derived_extension() {
        let encoded = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGNImXYJK2IYSAkAMi1WQVGZdXUAAAAASUVORK5CYII=";
        let upload = Upload {
            name: "suspicious.exe".into(),
            mime_type: "image/png".into(),
            data: encoded.into(),
        };
        let (bytes, extension) = image_bytes(&upload).unwrap();
        assert_eq!(bytes, STANDARD.decode(encoded).unwrap());
        assert_eq!(extension, "png");
        assert!(image_bytes(&Upload {
            mime_type: "image/jpeg".into(),
            ..upload
        })
        .is_err());
    }
    #[test]
    fn cleanup_uses_retained_directory_handles_after_path_replacement() {
        let root = tempfile::tempdir().unwrap();
        let copy = preview_copy(root.path(), "main", b"copy", "png").unwrap();
        let original = copy.path.parent().unwrap().to_path_buf();
        let moved = root.path().join("moved");
        if !crate::test_support::rename_retained_directory(&original, &moved) {
            drop(copy);
            assert!(!original.join("image.png").exists());
            return;
        }
        fs::create_dir(&original).unwrap();
        fs::write(original.join("image.png"), b"retain").unwrap();
        drop(copy);
        assert_eq!(fs::read(original.join("image.png")).unwrap(), b"retain");
        assert!(!moved.join("image.png").exists());
    }
    #[test]
    fn copies_are_private_bounded_and_cleaned_without_touching_originals() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("original.png");
        fs::write(&original, b"original").unwrap();
        let copy = preview_copy(root.path(), "main", b"preview bytes", "png").unwrap();
        let copied_path = copy.path.clone();
        assert_eq!(fs::read(&copied_path).unwrap(), b"preview bytes");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&copied_path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        drop(copy);
        assert!(!copied_path.exists());
        assert_eq!(fs::read(original).unwrap(), b"original");
    }
    #[test]
    fn preview_rejects_executable_mislabeled_and_invalid_image_payloads() {
        for (name, mime_type, data) in [
            ("bad.exe", "image/png", "executable"),
            ("../file", "image/png", "data"),
            (
                "x.svg",
                "image/svg+xml",
                "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
            ),
        ] {
            assert!(image_bytes(&Upload {
                name: name.into(),
                mime_type: mime_type.into(),
                data: STANDARD.encode(data)
            })
            .is_err());
        }
    }
}
