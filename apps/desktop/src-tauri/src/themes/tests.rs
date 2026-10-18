use super::*;
use std::fs;

fn setup() -> (tempfile::TempDir, ThemeHost) {
    let directory = tempfile::tempdir().unwrap();
    let host = ThemeHost::default();
    host.register_window("main").unwrap();
    host.catalog(directory.path()).unwrap();
    (directory, host)
}
fn write(directory: &Path, path: &str, bytes: &[u8]) {
    let path = directory.join("themes").join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}
fn prepare(host: &ThemeHost, config: &Path, id: &str, request_id: u64) -> PreparedThemeStyles {
    let request = host.begin_load("main", request_id).unwrap();
    host.prepare_styles(request, id, config).unwrap()
}
fn get(host: &ThemeHost, token: &str, path: &str) -> Response<Vec<u8>> {
    resource_response(host, "main", token, path, &Method::GET)
}

#[test]
fn ids_preserve_unicode_and_dots_but_reject_cross_platform_unsafe_names() {
    for valid in ["github", "中文", "my.theme-v2_好", "a..b", "prn-theme"] {
        assert!(valid_theme_id(valid), "{valid}");
    }
    for invalid in [
        "",
        ".hidden",
        ".",
        "..",
        "foo.",
        "foo ",
        "my theme",
        "Hi",
        "中文\n",
        "a/b",
        "a\\b",
        "a:b",
        "a%20b",
        "con",
        "nul.txt",
        "com1",
        "lpt9.md",
        "a?",
        "a|b",
        "base.user",
        "foo.user",
    ] {
        assert!(!valid_theme_id(invalid), "{invalid}");
    }
    assert!(valid_theme_id(&"中".repeat(120)));
    assert!(!valid_theme_id(&"中".repeat(121)));
    assert_eq!(display_name("my-theme"), "My Theme");
}
#[test]
fn own_folder_catalog_always_contains_builtins_and_excludes_override_files() {
    let (directory, host) = setup();
    write(directory.path(), "中文.dark.css", b"body{}");
    write(directory.path(), "github.css", b"body{color:red}");
    write(directory.path(), "base.user.css", b"body{}");
    write(directory.path(), "github.user.css", b"body{}");
    write(directory.path(), ".hidden.css", b"body{}");
    write(directory.path(), "ignore.txt", b"text");
    let result = host.catalog(directory.path()).unwrap();
    assert_eq!(
        result.folder_path,
        directory.path().join("themes").to_str().unwrap()
    );
    assert_eq!(result.themes.len(), 7);
    assert!(
        result
            .themes
            .iter()
            .find(|theme| theme.id == "github")
            .unwrap()
            .builtin
    );
    assert_eq!(result.themes.last().unwrap().id, "中文.dark");
    assert!(!result.themes.last().unwrap().builtin);
    let selected = prepare(&host, directory.path(), "github", 1);
    assert_eq!(selected.theme, "github");
    assert!(selected.styles.theme.unwrap().ends_with("/github.css"));
    assert!(selected
        .styles
        .base_user
        .unwrap()
        .ends_with("/base.user.css"));
    assert!(selected
        .styles
        .theme_user
        .unwrap()
        .ends_with("/github.user.css"));
    assert_eq!(
        get(&host, &selected.token, "github.css").body(),
        b"body{color:red}"
    );
}
#[test]
fn source_names_follow_mac_filter_without_rewriting_user_files() {
    let (directory, host) = setup();
    write(directory.path(), "MyTheme.css", b"first");
    write(directory.path(), "my-theme.css", b"second");
    write(directory.path(), "my theme.css", b"skip whitespace");
    write(directory.path(), "foo.CSS", b"skip upper suffix");
    write(directory.path(), "foo.css.bak", b"anchored safety check");
    let catalog = host.catalog(directory.path()).unwrap();
    assert_eq!(catalog.themes.len(), 7);
    assert_eq!(
        catalog
            .themes
            .iter()
            .find(|theme| theme.id == "my-theme")
            .unwrap()
            .name,
        "My Theme"
    );
    assert_eq!(
        catalog
            .themes
            .iter()
            .map(|theme| theme.id.as_str())
            .collect::<Vec<_>>(),
        [
            "github",
            "gothic",
            "my-theme",
            "newsprint",
            "night",
            "pixyll",
            "whitey"
        ]
    );
    assert_eq!(
        fs::read(directory.path().join("themes/MyTheme.css")).unwrap(),
        b"first"
    );
}
#[test]
fn full_css_filename_order_matches_the_original_fourteen_item_mac_theme_menu() {
    // Original native AX: private/evidence/theme-v19/native/theme-menu.ax.
    // Insert base/dark variants out of order; all six built-ins are supplied by catalog.
    let (directory, host) = setup();
    for id in [
        "vercel",
        "claude-like",
        "github-dark-dimmed",
        "lapis",
        "claude-like-dark",
        "github-dark-default",
        "lapis-dark",
        "github-dark-high-contrast",
    ] {
        write(directory.path(), &format!("{id}.css"), b"body{}");
    }
    let catalog = host.catalog(directory.path()).unwrap();
    assert_eq!(
        catalog
            .themes
            .iter()
            .map(|theme| (theme.id.as_str(), theme.name.as_str(), theme.builtin))
            .collect::<Vec<_>>(),
        [
            ("claude-like-dark", "Claude Like Dark", false),
            ("claude-like", "Claude Like", false),
            ("github-dark-default", "Github Dark Default", false),
            ("github-dark-dimmed", "Github Dark Dimmed", false),
            (
                "github-dark-high-contrast",
                "Github Dark High Contrast",
                false
            ),
            ("github", "Github", true),
            ("gothic", "Gothic", true),
            ("lapis-dark", "Lapis Dark", false),
            ("lapis", "Lapis", false),
            ("newsprint", "Newsprint", true),
            ("night", "Night", true),
            ("pixyll", "Pixyll", true),
            ("vercel", "Vercel", false),
            ("whitey", "Whitey", true),
        ]
    );
}
#[test]
fn custom_theme_urls_use_the_actual_source_filename_and_utf8_percent_encoding() {
    let (directory, host) = setup();
    write(directory.path(), "中文.theme.css", b"p{color:blue}");
    let result = prepare(&host, directory.path(), "中文.theme", 1);
    assert_eq!(result.theme, "github");
    assert!(result
        .styles
        .theme
        .as_ref()
        .unwrap()
        .ends_with("/%E4%B8%AD%E6%96%87.theme.css"));
    assert_eq!(
        get(&host, &result.token, "中文.theme.css").body(),
        b"p{color:blue}"
    );
}
#[test]
fn protocol_is_read_only_typed_scriptless_and_cross_window_revocable() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"a{}");
    write(directory.path(), "font.woff2", b"font");
    let result = prepare(&host, directory.path(), "github", 1);
    let font = get(&host, &result.token, "font.woff2");
    assert_eq!(font.status(), StatusCode::OK);
    assert_eq!(font.headers()[header::CONTENT_TYPE], "font/woff2");
    assert_eq!(font.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(font.headers()["X-Content-Type-Options"], "nosniff");
    assert_eq!(font.headers()["Content-Security-Policy"], RESOURCE_CSP);
    assert!(RESOURCE_CSP.contains("script-src 'none'"));
    let head = resource_response(&host, "main", &result.token, "font.woff2", &Method::HEAD);
    assert_eq!(head.status(), StatusCode::OK);
    assert!(head.body().is_empty());
    assert_eq!(
        head.headers()[header::CONTENT_LENGTH],
        font.headers()[header::CONTENT_LENGTH]
    );
    assert_eq!(
        resource_response(&host, "main", &result.token, "font.woff2", &Method::POST).status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
    assert_eq!(
        resource_response(
            &host,
            "editor-other",
            &result.token,
            "font.woff2",
            &Method::GET
        )
        .status(),
        StatusCode::NOT_FOUND
    );
    host.release_window("main");
    assert_eq!(
        get(&host, &result.token, "font.woff2").status(),
        StatusCode::NOT_FOUND
    );
}
#[test]
fn request_paths_do_not_escape_or_read_non_resource_types() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"");
    write(directory.path(), "source.js", b"secret");
    write(directory.path(), "image.svg", b"<svg/>");
    let result = prepare(&host, directory.path(), "github", 1);
    for path in [
        "../secret.css",
        "nested/../github.css",
        "/github.css",
        "a\\b.css",
        "a:b.css",
        "%2e%2e/secret.css",
        "a//b.css",
        ".secret.css",
        "con.css",
    ] {
        assert_eq!(
            get(&host, &result.token, path).status(),
            StatusCode::BAD_REQUEST,
            "{path}"
        );
    }
    assert_eq!(
        get(&host, &result.token, "source.js").status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        get(&host, &result.token, "image.svg").headers()[header::CONTENT_TYPE],
        "image/svg+xml"
    );
}
#[test]
fn cached_resources_are_stable_per_generation_and_new_load_sees_user_edits() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"old");
    let old = prepare(&host, directory.path(), "github", 1);
    host.accept_styles("main", &old.token).unwrap();
    write(directory.path(), "github.css", b"new");
    assert_eq!(get(&host, &old.token, "github.css").body(), b"old");
    let new = prepare(&host, directory.path(), "github", 2);
    assert_eq!(get(&host, &new.token, "github.css").body(), b"new");
    assert_eq!(
        get(&host, &old.token, "github.css").status(),
        StatusCode::OK
    );
    host.accept_styles("main", &new.token).unwrap();
    assert_eq!(
        get(&host, &old.token, "github.css").status(),
        StatusCode::NOT_FOUND
    );
    assert!(host.accept_styles("main", &old.token).is_err());
}
#[test]
fn active_theme_reports_the_accepted_actual_id_and_clears_only_the_closed_owner() {
    let (directory, host) = setup();
    host.register_window("editor-other").unwrap();
    write(directory.path(), "custom.css", b"body{}");
    assert_eq!(host.active_theme("main"), None);
    let custom = prepare(&host, directory.path(), "custom", 1);
    assert_eq!(custom.theme, "github");
    assert_eq!(host.active_theme("main"), None);
    host.accept_styles("main", &custom.token).unwrap();
    assert_eq!(host.active_theme("main").as_deref(), Some("custom"));
    let pending = prepare(&host, directory.path(), "night", 2);
    assert!(host.accept_styles("main", "unknown").is_err());
    assert_eq!(host.active_theme("main").as_deref(), Some("custom"));
    let other = host
        .prepare_styles(
            host.begin_load("editor-other", 1).unwrap(),
            "whitey",
            directory.path(),
        )
        .unwrap();
    host.accept_styles("editor-other", &other.token).unwrap();
    host.accept_styles("main", &pending.token).unwrap();
    assert_eq!(host.active_theme("main").as_deref(), Some("night"));
    host.release_window("main");
    assert_eq!(host.active_theme("main"), None);
    assert_eq!(host.active_theme("editor-other").as_deref(), Some("whitey"));
}
#[test]
fn rapid_prepares_failures_and_late_completion_cannot_revoke_the_active_theme() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"active");
    let active = prepare(&host, directory.path(), "github", 1);
    host.accept_styles("main", &active.token).unwrap();
    let pending = prepare(&host, directory.path(), "github", 2);
    let late = host.begin_load("main", 3).unwrap();
    let latest = host.begin_load("main", 4).unwrap();
    assert!(host
        .prepare_styles(late, "github", directory.path())
        .is_err());
    assert!(host
        .prepare_styles(latest, "missing", directory.path())
        .is_err());
    assert_eq!(
        get(&host, &pending.token, "github.css").status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(get(&host, &active.token, "github.css").body(), b"active");
    assert!(host.begin_load("main", 4).is_err());
    assert!(host.begin_load("main", 0).is_err());
    assert!(host.begin_load("main", MAX_SAFE_INTEGER + 1).is_err());
    assert!(host.accept_styles("editor-other", &active.token).is_err());
}
#[test]
fn closed_window_generation_cannot_install_after_reregistering_the_same_label() {
    let (directory, host) = setup();
    let request = host.begin_load("main", 1).unwrap();
    host.release_window("main");
    host.register_window("main").unwrap();
    assert!(host
        .prepare_styles(request, "github", directory.path())
        .is_err());
    let current = prepare(&host, directory.path(), "github", 1);
    host.accept_styles("main", &current.token).unwrap();
    host.register_window("main").unwrap();
    assert!(host.begin_load("main", 1).is_err());
    for index in 0..31 {
        host.register_window(&format!("editor-{index}")).unwrap();
    }
    assert!(host.register_window("overflow").is_err());
}
#[test]
fn css_limits_invalid_encoding_and_catalog_scan_limit_are_explicit() {
    let (directory, host) = setup();
    let active = prepare(&host, directory.path(), "github", 1);
    host.accept_styles("main", &active.token).unwrap();
    write(directory.path(), "github.css", b"\xff");
    let request = host.begin_load("main", 2).unwrap();
    assert!(host
        .prepare_styles(request, "github", directory.path())
        .unwrap_err()
        .contains("UTF-8"));
    fs::File::create(directory.path().join("themes/github.css"))
        .unwrap()
        .set_len(MAX_CSS_BYTES as u64 + 1)
        .unwrap();
    let request = host.begin_load("main", 3).unwrap();
    assert!(host
        .prepare_styles(request, "github", directory.path())
        .is_err());
    assert!(host.accept_styles("main", &active.token).is_ok());
    for index in 0..MAX_CATALOG_ENTRIES {
        write(directory.path(), &format!("skip{index}.txt"), b"");
    }
    assert!(host.catalog(directory.path()).unwrap_err().contains("1024"));
}
#[test]
fn per_resource_and_cache_budgets_are_bounded_and_released_with_the_window() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"");
    let path = directory.path().join("themes/large.woff2");
    fs::File::create(&path)
        .unwrap()
        .set_len(MAX_ASSET_BYTES as u64 + 1)
        .unwrap();
    let result = prepare(&host, directory.path(), "github", 1);
    assert_eq!(
        get(&host, &result.token, "large.woff2").status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    for filename in ["a.woff2", "b.woff2", "c.woff2"] {
        fs::File::create(directory.path().join("themes").join(filename))
            .unwrap()
            .set_len(MAX_ASSET_BYTES as u64)
            .unwrap();
    }
    for filename in ["a.woff2", "b.woff2"] {
        assert_eq!(get(&host, &result.token, filename).status(), StatusCode::OK);
    }
    assert_eq!(
        get(&host, &result.token, "c.woff2").status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(host.0.lock().unwrap().cached_bytes, MAX_LEASE_BYTES);
    host.release_window("main");
    assert_eq!(host.0.lock().unwrap().cached_bytes, 0);
}

#[test]
fn global_cache_limit_counts_active_and_pending_generations_without_evicting_active() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"");
    fs::File::create(directory.path().join("themes/font.woff2"))
        .unwrap()
        .set_len(MAX_ASSET_BYTES as u64)
        .unwrap();
    let mut active_token = String::new();
    for owner in ["main", "editor-1", "editor-2", "editor-3"] {
        host.register_window(owner).unwrap();
        for request_id in [1, 2] {
            let request = host.begin_load(owner, request_id).unwrap();
            let result = host
                .prepare_styles(request, "github", directory.path())
                .unwrap();
            assert_eq!(
                resource_response(&host, owner, &result.token, "font.woff2", &Method::GET).status(),
                StatusCode::OK
            );
            if request_id == 1 {
                host.accept_styles(owner, &result.token).unwrap();
                if owner == "main" {
                    active_token = result.token;
                }
            }
        }
    }
    assert_eq!(host.0.lock().unwrap().cached_bytes, MAX_CACHE_BYTES);
    host.register_window("editor-extra").unwrap();
    let request = host.begin_load("editor-extra", 1).unwrap();
    let extra = host
        .prepare_styles(request, "github", directory.path())
        .unwrap();
    assert_eq!(
        resource_response(
            &host,
            "editor-extra",
            &extra.token,
            "font.woff2",
            &Method::GET
        )
        .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        get(&host, &active_token, "font.woff2").status(),
        StatusCode::OK
    );
    host.release_window("editor-3");
    assert_eq!(
        resource_response(
            &host,
            "editor-extra",
            &extra.token,
            "font.woff2",
            &Method::GET
        )
        .status(),
        StatusCode::OK
    );
}

#[test]
fn empty_resources_still_count_toward_the_lease_entry_budget() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"");
    for index in 0..MAX_LEASE_ASSETS {
        write(directory.path(), &format!("{index}.png"), b"");
    }
    let result = prepare(&host, directory.path(), "github", 1);
    for index in 0..MAX_LEASE_ASSETS - 1 {
        assert_eq!(
            get(&host, &result.token, &format!("{index}.png")).status(),
            StatusCode::OK
        );
    }
    assert_eq!(
        get(
            &host,
            &result.token,
            &format!("{}.png", MAX_LEASE_ASSETS - 1)
        )
        .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(host.0.lock().unwrap().cached_bytes, 0);
}

#[test]
fn a_resource_request_already_waiting_on_the_old_lease_is_revoked_after_window_close() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"");
    write(
        directory.path(),
        "font.woff2",
        b"must not be delivered after close",
    );
    let result = prepare(&host, directory.path(), "github", 1);
    let lease = host.lease("main", &result.token).unwrap();
    let guard = lease.assets.lock().unwrap();
    let worker_host = host.clone();
    let worker = std::thread::spawn(move || get(&worker_host, &result.token, "font.woff2"));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while Arc::strong_count(&lease) < 3 {
        assert!(
            std::time::Instant::now() < deadline,
            "resource worker did not reach lease acquisition"
        );
        std::thread::yield_now();
    }
    host.release_window("main");
    host.register_window("main").unwrap();
    drop(guard);
    assert_eq!(worker.join().unwrap().status(), StatusCode::NOT_FOUND);
    assert_eq!(host.0.lock().unwrap().cached_bytes, 0);
}
#[cfg(unix)]
#[test]
fn symlinked_files_parents_and_theme_root_are_refused() {
    use std::os::unix::fs::symlink;
    let (directory, host) = setup();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.css"), b"outside").unwrap();
    fs::write(outside.path().join("font.woff2"), b"outside").unwrap();
    symlink(
        outside.path().join("secret.css"),
        directory.path().join("themes/leak.css"),
    )
    .unwrap();
    symlink(outside.path(), directory.path().join("themes/assets")).unwrap();
    symlink(
        outside.path().join("font.woff2"),
        directory.path().join("themes/font.woff2"),
    )
    .unwrap();
    assert_eq!(host.catalog(directory.path()).unwrap().themes.len(), 6);
    let result = prepare(&host, directory.path(), "github", 1);
    for path in ["leak.css", "assets/font.woff2", "font.woff2"] {
        assert_eq!(
            get(&host, &result.token, path).status(),
            StatusCode::NOT_FOUND
        );
    }
    symlink(
        outside.path().join("secret.css"),
        directory.path().join("themes/base.user.css"),
    )
    .unwrap();
    let request = host.begin_load("main", 2).unwrap();
    assert!(host
        .prepare_styles(request, "github", directory.path())
        .is_err());
    let config = tempfile::tempdir().unwrap();
    symlink(outside.path(), config.path().join("themes")).unwrap();
    assert!(ThemeHost::default().catalog(config.path()).is_err());
}
#[cfg(unix)]
#[test]
fn renamed_root_keeps_its_capability_and_never_opens_the_replacement_ambient_path() {
    let (directory, host) = setup();
    write(directory.path(), "github.css", b"old style");
    write(directory.path(), "assets/font.woff2", b"original font");
    let result = prepare(&host, directory.path(), "github", 1);
    fs::rename(
        directory.path().join("themes"),
        directory.path().join("moved"),
    )
    .unwrap();
    write(directory.path(), "github.css", b"replacement");
    write(directory.path(), "assets/font.woff2", b"replacement font");
    assert_eq!(
        get(&host, &result.token, "assets/font.woff2").body(),
        b"original font"
    );
    assert_eq!(get(&host, &result.token, "github.css").body(), b"old style");
    let current = prepare(&host, directory.path(), "github", 2);
    assert_eq!(
        get(&host, &current.token, "github.css").body(),
        b"old style"
    );
    assert!(host.folder_path(directory.path()).is_err());
}
