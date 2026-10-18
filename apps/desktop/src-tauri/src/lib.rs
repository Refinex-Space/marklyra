mod application_preferences;
mod clipboard;
mod commands;
mod context_menu;
mod editor_commands;
mod export_preferences;
mod exports;
mod external_links;
mod file_preferences;
mod markdown_preferences;
mod menu;
mod move_metadata;
mod os_open;
mod platform;
mod preferences_store;
mod rename_metadata;
mod runtime_assets;
mod startup;
mod themes;
mod window_services;
mod windows;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .invoke_system(runtime_assets::ipc_initialization_script())
        .manage(runtime_assets::RuntimeAssets::default())
        .manage(themes::ThemeHost::default())
        .manage(menu::themes::ThemeMenuState::default())
        .manage(menu::state::MenuStates::default())
        .manage(os_open::OsOpenHost::default())
        .manage(windows::EditorWindows::default())
        .manage(platform::ui_chrome::PreferencesHost::default())
        .manage(platform::ui_chrome::theme_selection::ThemePreferenceHost::default())
        .manage(platform::ui_chrome::markdown_selection::MarkdownPreferenceRequestHost::default())
        .manage(window_services::WindowServices::default())
        .manage(commands::images::ImageHost::default())
        .manage(context_menu::ContextMenuHost::default())
        .manage(clipboard::ClipboardHost::default())
        .manage(clipboard::NativeInputHost::default())
        .manage(exports::ExportHost::default())
        .manage(export_preferences::ExportPreferencesHost::default())
        .manage(commands::recovery::RecoveryHost::default())
        .manage(commands::recent::RecentFilesHost::default())
        .manage(file_preferences::FilePreferencesHost::default())
        .manage(markdown_preferences::MarkdownPreferencesHost::default())
        .manage(application_preferences::ApplicationPreferencesHost::default())
        .manage(startup::StartupHost::default())
        .register_uri_scheme_protocol("marklyra", |context, request| {
            runtime_assets::handle(context.app_handle(), context.webview_label(), &request)
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            editor_commands::register_editor_command_context,
            editor_commands::editor_command_fence,
            menu::state::sync_editor_menu_state,
            os_open::take_os_open,
            os_open::complete_os_open,
            windows::create_editor_window,
            windows::native_tab_action,
            windows::backup_editor_session,
            windows::editor_window_ready,
            windows::editor_window_focused,
            windows::close_editor_window,
            windows::cancel_application_quit,
            runtime_assets::editor_runtime_url,
            runtime_assets::host_platform,
            commands::themes::list_theme_catalog,
            commands::themes::load_theme_styles,
            commands::themes::accept_theme_styles,
            commands::themes::open_theme_folder,
            commands::themes::open_theme_gallery,
            commands::themes::sync_theme_menu,
            platform::ui_chrome::theme_selection::request_preference_theme,
            platform::ui_chrome::theme_selection::complete_preference_theme,
            platform::ui_chrome::markdown_selection::request_preference_markdown,
            platform::ui_chrome::markdown_selection::complete_preference_markdown,
            platform::ui_chrome::initialise_editor_chrome,
            platform::ui_chrome::update_editor_chrome,
            platform::ui_chrome::open_preferences_window,
            platform::ui_chrome::close_preferences_window,
            platform::ui_chrome::preferences_changed,
            context_menu::show_editor_context_menu,
            context_menu::close_editor_context_menu,
            clipboard::clipboard_read,
            clipboard::clipboard_read_image,
            clipboard::clipboard_write,
            clipboard::native_input::native_input_clipboard,
            clipboard::native_input::import_native_input_images,
            clipboard::native_input::cancel_native_input,
            platform::native_drop::initialise_native_drop,
            commands::native_input::open_native_input_document,
            commands::native_input::open_native_input_workspace,
            external_links::open_external_link,
            application_preferences::get_application_preferences,
            application_preferences::put_editor_appearance_preference,
            application_preferences::step_application_zoom,
            application_preferences::system_appearance_dark,
            application_preferences::reset_dialog_warnings,
            application_preferences::apply_application_zoom,
            application_preferences::put_application_preferences,
            commands::workspaces::move_workspace_entry,
            commands::workspaces::resolve_workspace_entry_move,
            commands::workspaces::duplicate_workspace_entry,
            commands::workspaces::resolve_workspace_entry_duplicate,
            commands::workspaces::perform_workspace_entry_action,
            commands::workspaces::resolve_workspace_entry_action,
            commands::open_document,
            commands::save_document,
            commands::save_document_as,
            commands::images::create_image_draft,
            commands::images::set_document_image_context,
            commands::images::close_image_draft,
            commands::images::save::prepare_document_image_save,
            commands::images::save::commit_document_image_save,
            commands::images::save::cancel_document_image_save,
            commands::images::perform_document_image_action,
            commands::images::cancel_document_image_action,
            commands::untitled_close::prepare_untitled_close,
            commands::get_document_metadata,
            commands::close_document,
            commands::changes::check_document_change,
            commands::changes::accept_document_change,
            commands::changes::dismiss_document_change,
            commands::changes::start_document_watch,
            commands::changes::stop_document_watch,
            commands::recovery::begin_recovery_session,
            commands::recovery::checkpoint_recovery,
            commands::recovery::list_recovery_drafts,
            commands::recovery::read_recovery_draft,
            commands::recovery::consume_recovery_draft,
            commands::recovery::end_recovery_session,
            commands::recovery::fallback_recovery_context,
            commands::recovery::import_fallback_recovery,
            commands::recent::list_recent_files,
            commands::recent::remember_recent_file,
            commands::recent::open_recent_file,
            commands::recent::remove_recent_file,
            commands::recent::clear_recent_files,
            file_preferences::get_file_preferences,
            file_preferences::put_file_preference,
            file_preferences::ask_clear_recent_history,
            file_preferences::directories::list_directory_history,
            file_preferences::directories::pin_directory_history,
            file_preferences::directories::remove_directory_history,
            file_preferences::directories::open_directory_history,
            file_preferences::directories::open_directory_history_window,
            file_preferences::directories::reveal_workspace_directory,
            markdown_preferences::get_markdown_preferences,
            markdown_preferences::put_markdown_preferences,
            startup::get_startup_preferences,
            startup::set_startup_mode,
            startup::choose_startup_folder,
            startup::get_window_startup,
            startup::track_window_session,
            commands::images::resolve_document_image,
            commands::images::import_document_image,
            commands::workspaces::select_workspace,
            commands::workspaces::list_directory,
            commands::workspaces::snapshot_workspace,
            commands::workspaces::list_workspace_documents,
            commands::workspaces::open_workspace_document,
            commands::workspaces::search_workspace,
            commands::workspaces::close_workspace,
            commands::workspaces::create_workspace_entry,
            commands::workspaces::rename_workspace_creation,
            commands::workspaces::inspect_workspace_entry,
            commands::workspaces::rename_workspace_entry,
            commands::workspaces::resolve_workspace_entry_rename,
            commands::workspaces::finish_workspace_entry,
            commands::workspaces::get_workspace_file_undo,
            commands::workspaces::perform_workspace_file_undo,
            commands::workspaces::resolve_workspace_file_undo,
            commands::workspaces::trash_workspace_entry,
            commands::workspaces::resolve_workspace_entry_trash,
            commands::workspaces::finish_workspace_creation,
            commands::workspaces::create_workspace_file_with_dialog,
            exports::save_export_html,
            exports::open_print_preview,
            exports::formats::get_format_capabilities,
            exports::formats::choose_pandoc_path,
            exports::formats::save_export_format,
            exports::formats::import_document,
            exports::image::save_export_image,
            export_preferences::get_export_preferences,
            export_preferences::put_export_preferences,
        ])
        .setup(|app| {
            windows::register(app.handle(), "main")?;
            let native_menu = menu::build(app.handle())?;
            app.set_menu(native_menu.clone())?;
            #[cfg(target_os = "macos")]
            menu::register_window_menu(&native_menu)?;
            commands::recent::refresh_native_menu(app.handle());
            if let Err(error) = platform::window_state::setup(app.handle()) {
                eprintln!("Window preferences were not restored: {error}");
            }
            windows::restore_initial(app.handle());
            os_open::capture_process_arguments(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                windows::request_quit(app);
                return;
            }
            if platform::ui_chrome::handle_menu(app, &event) {
                return;
            }
            if context_menu::handle_menu(app, &event) {
                return;
            }
            if !exports::handle_menu(app, &event) {
                menu::handle(app, event);
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<menu::state::MenuStates>()
                    .release(window.label());
            }
            platform::native_drop::handle_window(window, event);
            platform::trash_confirmation::handle_window(window.app_handle(), window, event);
            platform::untitled_close::handle_window(window, event);
            context_menu::handle_window(window, event);
            exports::handle_window(window, event);
            if matches!(event, tauri::WindowEvent::Focused(true)) && window.label() == "preferences"
            {
                if let Err(error) = menu::set_preview_context(window.app_handle(), false) {
                    eprintln!("Preferences menu state was not synchronized: {error}");
                }
            }
            platform::window_state::handle_window(window, event);
            windows::handle_window(window, event);
        })
        .build(tauri::generate_context!())
        .expect("MarkLyra desktop failed to build")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => os_open::receive_urls(app, urls),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => os_open::reopen(app, has_visible_windows),
            tauri::RunEvent::ExitRequested { api, .. } if windows::has_editors(app) => {
                api.prevent_exit();
                windows::request_quit(app);
            }
            tauri::RunEvent::Exit => platform::window_state::handle_exit(app),
            _ => {}
        });
}
