//! Read-only serving for the separately packaged private runtime runtime.
//! No original source or commercial asset is embedded in this Rust module.
//!
//! Injection audit (Tauri 2.12.3 / Wry 0.57.0): manager/webview.rs first adds
//! internal seed object, invoke_initialization_script, webview metadata, then
//! init.js/core.js/events
//! and plugin scripts. Only the default ipc-protocol.js template materializes
//! the invoke key; invoke_system replaces that template. CoreJavascript carries
//! an unused invoke_key field, but core.js contains no key placeholder. The
//! installed dialog init script only delegates alert/confirm to core invoke.
//! Wry installs window.ipc before these scripts; WebView2 also runs them in child
//! frames. Do not remove the top-frame/origin guard when upgrading dependencies.
//! JS VM and MockRuntime tests cover the transport/key gate, not real WebView2
//! injection nor integrated native open/save/window event acceptance.
use cap_std::{ambient_authority, fs::Dir};
use std::{
    io::Read,
    path::{Path, PathBuf},
    sync::OnceLock,
};
use tauri::{
    http::{header, Method, Request, Response, StatusCode, Uri},
    AppHandle, Manager, Runtime,
};

const MAX_ASSET_BYTES: u64 = 32 * 1024 * 1024;
const RUNTIME_CSP: &str = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
pub fn ipc_initialization_script() -> String {
    include_str!("runtime_ipc.js").replace(
        "__MARKLYRA_DEV__",
        if cfg!(debug_assertions) {
            "true"
        } else {
            "false"
        },
    )
}

const ROOT_FILES: &[&str] = &[
    "index.html",
    "frame-host.js",
    "empty.css",
    "runtime-manifest.json",
];
const ROOT_DIRECTORIES: &[&str] = &["appsrc", "assets", "html", "lib", "locales", "style"];
const PREFERENCE_FILES: &[&str] = &[
    "setting.html",
    "child-host.js",
    "empty.css",
    "preferences-manifest.json",
    "cocoa.css",
    "electron.css",
    "static/js/0.99879679.chunk.js",
    "static/js/Preferences.962926a4.d7f6a912.chunk.js",
    "static/css/Preferences.962926a4.d430ac69.chunk.css",
    "static/media/photon-entypo.bf614256.woff",
    "static/media/photon-entypo.2614e058.eot",
    "static/media/photon-entypo.1382c29c.ttf",
    "locales/zh-Hans.lproj/Front.json",
    "locales/zh-Hans.lproj/Menu.json",
    "locales/zh-Hans.lproj/Panel.json",
    "locales/zh-Hans.lproj/Welcome.json",
    "locales/Base.lproj/Front.json",
    "locales/Base.lproj/Menu.json",
    "locales/Base.lproj/Panel.json",
    "locales/Base.lproj/Welcome.json",
];

#[derive(Default)]
pub struct RuntimeAssets {
    root: OnceLock<Option<Dir>>,
}

#[tauri::command]
pub fn editor_runtime_url() -> &'static str {
    if cfg!(target_os = "windows") {
        "http://marklyra.localhost/index.html"
    } else {
        "marklyra://localhost/index.html"
    }
}

#[tauri::command]
pub fn host_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unsupported"
    }
}

pub fn handle<R: Runtime>(
    app: &AppHandle<R>,
    webview_label: &str,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if let Ok(path) = resource_path(request.uri()) {
        if path.starts_with("__styles") {
            let mut parts = path.components().skip(1);
            let token = parts
                .next()
                .and_then(|part| part.as_os_str().to_str())
                .unwrap_or_default();
            let relative = parts
                .filter_map(|part| part.as_os_str().to_str())
                .collect::<Vec<_>>()
                .join("/");
            return crate::themes::resource_response(
                &app.state::<crate::themes::ThemeHost>(),
                webview_label,
                token,
                &relative,
                request.method(),
            );
        }
        if path.starts_with("__exports") {
            let token = path
                .components()
                .nth(1)
                .and_then(|part| part.as_os_str().to_str())
                .unwrap_or_default();
            return crate::exports::response(
                &app.state::<crate::exports::ExportHost>(),
                webview_label,
                token,
                request.method(),
            );
        }
        if path.starts_with("__images") {
            let token = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            let services = app.state::<crate::window_services::WindowServices>();
            let Ok(documents) = services.get_documents(webview_label) else {
                return error(
                    StatusCode::NOT_FOUND,
                    "Image window unavailable",
                    request.method() == Method::HEAD,
                );
            };
            return match documents.lock() {
                Ok(documents) => image_response(documents.image(token), request.method()),
                Err(_) => error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Document image state unavailable",
                    request.method() == Method::HEAD,
                ),
            };
        }
    }
    let state = app.state::<RuntimeAssets>();
    let root = state.root.get_or_init(|| {
        let bundled = app
            .path()
            .resource_dir()
            .ok()
            .map(|path| path.join("runtime"));
        #[cfg(debug_assertions)]
        let development =
            Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../dist/editor-runtime"));
        #[cfg(not(debug_assertions))]
        let development: Option<PathBuf> = None;
        select_root(bundled.as_deref(), development.as_deref())
    });
    serve(root.as_ref(), request)
}

pub fn image_url(token: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("http://marklyra.localhost/__images/{token}")
    } else {
        format!("marklyra://localhost/__images/{token}")
    }
}
fn valid_image_token(token: &str) -> bool {
    token.len() == 36
        && token.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}
fn image_response(
    resource: Option<document_service::ImageResource>,
    method: &Method,
) -> Response<Vec<u8>> {
    let head = method == Method::HEAD;
    if method != Method::GET && !head {
        let mut result = error(
            StatusCode::METHOD_NOT_ALLOWED,
            "Read-only image protocol",
            false,
        );
        result
            .headers_mut()
            .insert(header::ALLOW, "GET, HEAD".parse().expect("static header"));
        return result;
    }
    let Some(resource) = resource else {
        return error(StatusCode::NOT_FOUND, "Image token unavailable", head);
    };
    let mut result = response(
        StatusCode::OK,
        resource.mime,
        resource.bytes.len() as u64,
        if head {
            Vec::new()
        } else {
            resource.bytes.to_vec()
        },
    );
    result.headers_mut().insert(
        "Content-Security-Policy",
        document_service::IMAGE_CSP
            .parse()
            .expect("static image policy"),
    );
    result
}

fn select_root(bundled: Option<&Path>, development: Option<&Path>) -> Option<Dir> {
    // An existing but incomplete bundle is not silently replaced by a checkout.
    let path = match bundled {
        Some(path) if path.exists() => path,
        _ => development?,
    };
    let root = Dir::open_ambient_dir(path, ambient_authority()).ok()?;
    for required in ["index.html", "frame-host.js", "runtime-manifest.json"] {
        if !root.open(required).ok()?.metadata().ok()?.is_file() {
            return None;
        }
    }
    Some(root)
}

fn serve(root: Option<&Dir>, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let head = request.method() == Method::HEAD;
    if request.method() != Method::GET && !head {
        let mut response = error(
            StatusCode::METHOD_NOT_ALLOWED,
            "Read-only resource protocol",
            false,
        );
        response
            .headers_mut()
            .insert(header::ALLOW, "GET, HEAD".parse().expect("static header"));
        return response;
    }
    let path = match resource_path(request.uri()) {
        Ok(path) => path,
        Err(status) => return error(status, "Invalid resource path", head),
    };
    if path.starts_with("__images") || path.starts_with("__exports") || path.starts_with("__styles")
    {
        return error(StatusCode::NOT_FOUND, "Image token unavailable", head);
    }
    let Some(root) = root else {
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Runtime runtime assets unavailable",
            head,
        );
    };
    let file = match root.open(&path) {
        Ok(file) => file,
        Err(_) => return error(StatusCode::NOT_FOUND, "Resource not found", head),
    };
    let metadata = match file.metadata() {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => return error(StatusCode::NOT_FOUND, "Resource not found", head),
    };
    if metadata.len() > MAX_ASSET_BYTES {
        return error(StatusCode::PAYLOAD_TOO_LARGE, "Resource too large", head);
    }
    if head {
        return response(StatusCode::OK, mime_type(&path), metadata.len(), Vec::new());
    }
    let mut body = Vec::with_capacity(metadata.len() as usize);
    if file
        .take(MAX_ASSET_BYTES + 1)
        .read_to_end(&mut body)
        .is_err()
    {
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Resource read failed",
            false,
        );
    }
    if body.len() as u64 > MAX_ASSET_BYTES {
        return error(StatusCode::PAYLOAD_TOO_LARGE, "Resource too large", false);
    }
    response(StatusCode::OK, mime_type(&path), body.len() as u64, body)
}

fn resource_path(uri: &Uri) -> Result<PathBuf, StatusCode> {
    let authority = uri.authority().ok_or(StatusCode::BAD_REQUEST)?.as_str();
    let allowed_host = authority.eq_ignore_ascii_case("localhost")
        || authority.eq_ignore_ascii_case("marklyra.localhost");
    let allowed_scheme = uri.scheme_str() == Some("marklyra")
        || uri.scheme_str() == Some("http") && authority.eq_ignore_ascii_case("marklyra.localhost");
    if !allowed_host || !allowed_scheme {
        return Err(StatusCode::FORBIDDEN);
    }
    let raw = uri.path();
    if raw.len() > 8192 {
        return Err(StatusCode::URI_TOO_LONG);
    }
    let decoded = decode_path(raw)?;
    let path = decoded.strip_prefix('/').ok_or(StatusCode::BAD_REQUEST)?;
    if path.is_empty()
        || path.contains(['\\', ':', '\0', '%'])
        || path.chars().any(char::is_control)
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.iter().any(|part| {
        part.is_empty()
            || *part == "."
            || *part == ".."
            || part.ends_with(['.', ' '])
            || reserved_name(part)
    }) {
        return Err(StatusCode::BAD_REQUEST);
    }
    if let Some(preferences) = path.strip_prefix("preferences/") {
        return if PREFERENCE_FILES.contains(&preferences) {
            Ok(PathBuf::from(path))
        } else {
            Err(StatusCode::NOT_FOUND)
        };
    }
    if parts.first() == Some(&"__styles") {
        if parts.len() < 3 || !valid_image_token(parts[1]) {
            return Err(StatusCode::BAD_REQUEST);
        }
        return Ok(PathBuf::from(path));
    }
    if parts.first() == Some(&"__images") {
        if parts.len() != 2 || !valid_image_token(parts[1]) {
            return Err(StatusCode::BAD_REQUEST);
        }
        return Ok(PathBuf::from(path));
    }
    if parts.first() == Some(&"__exports") {
        if parts.len() != 3 || !valid_image_token(parts[1]) || parts[2] != "index.html" {
            return Err(StatusCode::BAD_REQUEST);
        }
        return Ok(PathBuf::from(path));
    }
    if parts.len() == 1 {
        if !ROOT_FILES.contains(&parts[0]) {
            return Err(StatusCode::NOT_FOUND);
        }
    } else if !ROOT_DIRECTORIES.contains(&parts[0]) {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(PathBuf::from(path))
}

fn decode_path(raw: &str) -> Result<String, StatusCode> {
    let mut bytes = Vec::with_capacity(raw.len());
    let mut source = raw.as_bytes().iter().copied();
    while let Some(byte) = source.next() {
        if byte != b'%' {
            bytes.push(byte);
            continue;
        }
        let high = source.next().and_then(hex).ok_or(StatusCode::BAD_REQUEST)?;
        let low = source.next().and_then(hex).ok_or(StatusCode::BAD_REQUEST)?;
        bytes.push(high * 16 + low);
    }
    String::from_utf8(bytes).map_err(|_| StatusCode::BAD_REQUEST)
}
fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
fn reserved_name(part: &str) -> bool {
    let stem = part
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9')
}
fn mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|part| part.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "eot" => "application/vnd.ms-fontobject",
        "wasm" => "application/wasm",
        "txt" | "md" | "markdown" => "text/plain; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}
fn response(
    status: StatusCode,
    mime: &'static str,
    length: u64,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, length)
        .header("Content-Security-Policy", RUNTIME_CSP)
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .expect("resource response uses only fixed valid headers")
}
fn error(status: StatusCode, message: &'static str, head: bool) -> Response<Vec<u8>> {
    response(
        status,
        "text/plain; charset=utf-8",
        message.len() as u64,
        if head {
            Vec::new()
        } else {
            message.as_bytes().to_vec()
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture() -> (tempfile::TempDir, Dir) {
        let temporary = tempfile::tempdir().unwrap();
        for directory in ROOT_DIRECTORIES {
            fs::create_dir(temporary.path().join(directory)).unwrap();
        }
        fs::write(temporary.path().join("index.html"), b"<p>Fixture</p>").unwrap();
        fs::write(temporary.path().join("frame-host.js"), b"export {};").unwrap();
        fs::write(temporary.path().join("runtime-manifest.json"), b"{}").unwrap();
        let directory = Dir::open_ambient_dir(temporary.path(), ambient_authority()).unwrap();
        (temporary, directory)
    }
    fn request(method: &str, url: &str) -> Request<Vec<u8>> {
        Request::builder()
            .method(method)
            .uri(url)
            .body(Vec::new())
            .unwrap()
    }

    // This exercises the real Tauri on_message key gate with MockRuntime. It
    // does not claim WebKit/WebView2 injection or raw native bridge validation.
    #[test]
    fn tauri_dispatch_rejects_missing_and_wrong_keys_before_commands() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        use tauri::{
            ipc::{CallbackFn, InvokeBody},
            test::{mock_builder, mock_context, noop_assets, INVOKE_KEY},
            webview::InvokeRequest,
        };
        let dispatched = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&dispatched);
        let app = mock_builder()
            .invoke_system(ipc_initialization_script())
            .invoke_handler(move |invoke| {
                counter.fetch_add(1, Ordering::SeqCst);
                invoke.resolver.resolve("fixture");
                true
            })
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let replies = Arc::new(AtomicUsize::new(0));
        for key in ["", "wrong-fixture-key", INVOKE_KEY] {
            let received = Arc::clone(&replies);
            window.as_ref().clone().on_message(
                InvokeRequest {
                    cmd: "fixture".to_owned(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: InvokeBody::default(),
                    headers: Default::default(),
                    invoke_key: key.to_owned(),
                },
                Box::new(move |_, _, _, _, _| {
                    received.fetch_add(1, Ordering::SeqCst);
                }),
            );
            let expected = usize::from(key == INVOKE_KEY);
            assert_eq!(dispatched.load(Ordering::SeqCst), expected);
            assert_eq!(replies.load(Ordering::SeqCst), expected);
        }
    }

    #[test]
    fn original_json_transport_security_contract() {
        let output = std::process::Command::new("node")
            .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/runtime_ipc.test.mjs"))
            .output()
            .expect("Node.js is required for transport security tests");
        assert!(
            output.status.success(),
            "transport security checks failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn image_urls_serve_registered_bytes_with_strict_policy_and_revoke_on_close() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("note.md"), "note").unwrap();
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>"#;
        fs::write(temp.path().join("image.svg"), svg).unwrap();
        let mut documents = document_service::DocumentService::new();
        let document = documents
            .open_authorized(&temp.path().join("note.md"))
            .unwrap();
        let registered = documents.resolve_image(&document.id, "image.svg").unwrap();
        assert!(valid_image_token(&registered.token));
        let uri: Uri = image_url(&registered.token).parse().unwrap();
        assert_eq!(
            resource_path(&uri).unwrap(),
            PathBuf::from(format!("__images/{}", registered.token))
        );
        let get = image_response(documents.image(&registered.token), &Method::GET);
        assert_eq!(get.status(), StatusCode::OK);
        assert_eq!(get.body(), svg);
        assert_eq!(get.headers()[header::CONTENT_TYPE], "image/svg+xml");
        assert_eq!(
            get.headers()["Content-Security-Policy"],
            document_service::IMAGE_CSP
        );
        assert!(!document_service::IMAGE_CSP.contains("unsafe-eval"));
        let head = image_response(documents.image(&registered.token), &Method::HEAD);
        assert!(head.body().is_empty());
        assert_eq!(
            head.headers()[header::CONTENT_LENGTH],
            svg.len().to_string()
        );
        assert_eq!(
            image_response(documents.image(&registered.token), &Method::POST).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
        documents.close(&document.id);
        assert_eq!(
            image_response(documents.image(&registered.token), &Method::GET).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn image_protocol_scopes_tokens_to_requesting_webview() {
        use tauri::test::{mock_builder, mock_context, noop_assets};
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("note.md"), "note").unwrap();
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
        fs::write(temp.path().join("image.svg"), svg).unwrap();
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        let documents = services.get_documents("main").unwrap();
        let document = documents
            .lock()
            .unwrap()
            .open_authorized(&temp.path().join("note.md"))
            .unwrap();
        let image = documents
            .lock()
            .unwrap()
            .resolve_image(&document.id, "image.svg")
            .unwrap();
        let app = mock_builder()
            .manage(services)
            .build(mock_context(noop_assets()))
            .unwrap();
        let request = request("GET", &image_url(&image.token));
        assert_eq!(handle(app.handle(), "main", &request).body(), svg);
        assert_eq!(
            handle(app.handle(), "editor-second", &request).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            handle(app.handle(), "unregistered", &request).status(),
            StatusCode::NOT_FOUND
        );
        app.state::<crate::window_services::WindowServices>()
            .remove("main")
            .unwrap();
        assert_eq!(
            handle(app.handle(), "main", &request).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn image_route_never_falls_back_to_filesystem_paths() {
        let (temp, directory) = fixture();
        let token = "00000000-0000-4000-8000-000000000000";
        fs::create_dir(temp.path().join("__images")).unwrap();
        fs::write(
            temp.path().join("__images").join(token),
            b"must not be read from disk",
        )
        .unwrap();
        assert_eq!(
            serve(
                Some(&directory),
                &request("GET", &format!("marklyra://localhost/__images/{token}"))
            )
            .status(),
            StatusCode::NOT_FOUND
        );
        for path in [
            "__images/../../index.html",
            "__images/file.png",
            "__images/00000000-0000-4000-8000-000000000000/extra",
        ] {
            assert!(
                resource_path(&format!("marklyra://localhost/{path}").parse().unwrap()).is_err()
            );
        }
    }

    #[test]
    fn preview_route_never_falls_back_to_disk_or_other_root_paths() {
        let (temp, directory) = fixture();
        let token = "00000000-0000-4000-8000-000000000000";
        fs::create_dir_all(temp.path().join("__exports").join(token)).unwrap();
        fs::write(
            temp.path().join("__exports").join(token).join("index.html"),
            "must not serve",
        )
        .unwrap();
        for origin in ["marklyra://localhost", "http://marklyra.localhost"] {
            let uri = format!("{origin}/__exports/{token}/index.html");
            assert!(resource_path(&uri.parse().unwrap()).is_ok());
            assert_eq!(
                serve(Some(&directory), &request("GET", &uri)).status(),
                StatusCode::NOT_FOUND
            );
        }
        for path in [
            "__exports/token/index.html",
            "__exports/00000000-0000-4000-8000-000000000000/../index.html",
            "__exports/00000000-0000-4000-8000-000000000000/other.html",
            "__exports/00000000-0000-4000-8000-000000000000/index.html/extra",
        ] {
            assert!(
                resource_path(&format!("marklyra://localhost/{path}").parse().unwrap()).is_err()
            );
        }
    }

    #[test]
    fn native_and_windows_origins_accept_query_without_changing_resource() {
        let (_temporary, dir) = fixture();
        for url in [
            "marklyra://localhost/index.html?channel=opaque",
            "http://marklyra.localhost/index.html?channel=..%2fsecret",
            "marklyra://marklyra.localhost/index.html",
        ] {
            let result = serve(Some(&dir), &request("GET", url));
            assert_eq!(result.status(), StatusCode::OK);
            assert_eq!(result.body(), b"<p>Fixture</p>");
        }
    }
    #[test]
    fn preferences_serve_only_the_verified_generated_resource_set() {
        let (temporary, directory) = fixture();
        std::fs::create_dir_all(temporary.path().join("preferences/static/js")).unwrap();
        std::fs::write(
            temporary.path().join("preferences/setting.html"),
            "<p>Preferences</p>",
        )
        .unwrap();
        std::fs::write(
            temporary.path().join("preferences/secret.txt"),
            "not selected",
        )
        .unwrap();
        for origin in ["marklyra://localhost", "http://marklyra.localhost"] {
            let url = format!("{origin}/preferences/setting.html?channel=opaque");
            assert_eq!(
                serve(Some(&directory), &request("GET", &url)).body(),
                b"<p>Preferences</p>"
            );
            for path in [
                "secret.txt",
                "license.html",
                "static/js/other.js",
                "../index.html",
                "static//x.js",
            ] {
                assert!(
                    resource_path(&format!("{origin}/preferences/{path}").parse().unwrap())
                        .is_err()
                );
            }
        }
    }
    #[test]
    fn traversal_and_ambiguous_windows_paths_are_rejected() {
        for path in [
            "/../index.html",
            "/style/../../secret",
            "/%2e%2e/index.html",
            "/style/%2E%2E/secret",
            "/%252e%252e/index.html",
            "/style%5c..%5csecret",
            "/style/C%3a/secret",
            "/style/%00.css",
            "//index.html",
            "/style//x.css",
            "/style/..%20/x.css",
            "/style/CON.css",
            "/style/%ff.css",
            "/style/%.css",
            "/",
        ] {
            let uri = format!("marklyra://localhost{path}").parse().unwrap();
            assert!(resource_path(&uri).is_err(), "{path}");
        }
        for url in [
            "marklyra://evil/index.html",
            "marklyra://user@localhost/index.html",
            "marklyra://localhost:123/index.html",
            "https://marklyra.localhost/index.html",
            "http://localhost/index.html",
        ] {
            assert!(resource_path(&url.parse().unwrap()).is_err(), "{url}");
        }
    }
    #[test]
    fn utf8_names_and_mime_types_are_preserved() {
        let (temporary, dir) = fixture();
        fs::write(temporary.path().join("style/中文.css"), b"body{}").unwrap();
        let result = serve(
            Some(&dir),
            &request("GET", "marklyra://localhost/style/%E4%B8%AD%E6%96%87.css"),
        );
        assert_eq!(result.status(), StatusCode::OK);
        assert_eq!(
            result.headers()[header::CONTENT_TYPE],
            "text/css; charset=utf-8"
        );
        for (path, mime) in [
            ("x.js", "text/javascript; charset=utf-8"),
            ("x.html", "text/html; charset=utf-8"),
            ("x.json", "application/json; charset=utf-8"),
            ("x.svg", "image/svg+xml"),
            ("x.woff2", "font/woff2"),
            ("x.png", "image/png"),
            ("x.unknown", "application/octet-stream"),
        ] {
            assert_eq!(mime_type(Path::new(path)), mime);
        }
    }
    #[test]
    fn head_has_get_length_and_no_body() {
        let (_temporary, dir) = fixture();
        let result = serve(
            Some(&dir),
            &request("HEAD", "marklyra://localhost/index.html"),
        );
        assert_eq!(result.status(), StatusCode::OK);
        assert!(result.body().is_empty());
        assert_eq!(result.headers()[header::CONTENT_LENGTH], "14");
        let missing = serve(
            Some(&dir),
            &request("HEAD", "marklyra://localhost/style/missing.css"),
        );
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        assert!(missing.body().is_empty());
    }
    #[test]
    fn unknown_roots_methods_and_directory_listings_are_not_served() {
        let (temporary, dir) = fixture();
        fs::write(temporary.path().join("secret.txt"), b"not a runtime asset").unwrap();
        for path in ["secret.txt", "unlisted/file.js", "style", "style/"] {
            assert!(!serve(
                Some(&dir),
                &request("GET", &format!("marklyra://localhost/{path}"))
            )
            .status()
            .is_success());
        }
        for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] {
            let result = serve(
                Some(&dir),
                &request(method, "marklyra://localhost/index.html"),
            );
            assert_eq!(result.status(), StatusCode::METHOD_NOT_ALLOWED);
            assert_eq!(result.headers()[header::ALLOW], "GET, HEAD");
        }
        assert_eq!(
            fs::read(temporary.path().join("index.html")).unwrap(),
            b"<p>Fixture</p>"
        );
    }
    #[test]
    fn every_response_has_isolated_policy_and_no_unrestricted_cors() {
        let (_temporary, dir) = fixture();
        for url in [
            "marklyra://localhost/index.html",
            "marklyra://localhost/unknown.txt",
        ] {
            let result = serve(Some(&dir), &request("GET", url));
            assert_eq!(result.headers()["X-Content-Type-Options"], "nosniff");
            assert_eq!(result.headers()["Content-Security-Policy"], RUNTIME_CSP);
            assert!(!result
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
            assert!(RUNTIME_CSP.contains("connect-src 'self'"));
            assert!(RUNTIME_CSP.contains("frame-src 'none'"));
        }
    }
    #[test]
    fn oversized_assets_and_missing_runtime_are_bounded_errors() {
        let (temporary, dir) = fixture();
        fs::File::create(temporary.path().join("assets/huge.bin"))
            .unwrap()
            .set_len(MAX_ASSET_BYTES + 1)
            .unwrap();
        assert_eq!(
            serve(
                Some(&dir),
                &request("GET", "marklyra://localhost/assets/huge.bin")
            )
            .status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        assert_eq!(
            serve(None, &request("GET", "marklyra://localhost/index.html")).status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
    }
    #[test]
    fn release_style_root_selection_cannot_fall_back_without_explicit_dev_path() {
        let (temporary, _dir) = fixture();
        assert!(select_root(None, None).is_none());
        assert!(select_root(None, Some(temporary.path())).is_some());
        let broken = tempfile::tempdir().unwrap();
        assert!(select_root(Some(broken.path()), Some(temporary.path())).is_none());
        assert!(select_root(Some(temporary.path()), None).is_some());
    }
    #[cfg(unix)]
    #[test]
    fn external_file_and_directory_symlinks_cannot_escape_root() {
        use std::os::unix::fs::symlink;
        let (temporary, dir) = fixture();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.js"), b"outside secret").unwrap();
        symlink(
            outside.path().join("secret.js"),
            temporary.path().join("assets/escape.js"),
        )
        .unwrap();
        symlink(outside.path(), temporary.path().join("assets/escape")).unwrap();
        for path in ["assets/escape.js", "assets/escape/secret.js"] {
            let result = serve(
                Some(&dir),
                &request("GET", &format!("marklyra://localhost/{path}")),
            );
            assert_eq!(result.status(), StatusCode::NOT_FOUND);
            assert!(!String::from_utf8_lossy(result.body()).contains("outside secret"));
        }
    }
}
