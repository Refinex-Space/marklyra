#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `marklyra …` launchers run the task command line without starting the app.
    if std::env::args().nth(1).as_deref() == Some("--cli") {
        #[cfg(windows)]
        // SAFETY: attaching to the parent console only redirects this process's standard
        // handles; failing (no parent console) leaves them as they were.
        unsafe {
            let _ = windows::Win32::System::Console::AttachConsole(
                windows::Win32::System::Console::ATTACH_PARENT_PROCESS,
            );
        }
        std::process::exit(task_store::cli::main(std::env::args().skip(2).collect()));
    }
    if std::env::args().nth(1).as_deref() == Some("--agent-mcp-stdio") {
        if marklyra_desktop_lib::agents::proxy_main().is_err() {
            std::process::exit(1);
        }
        return;
    }
    marklyra_desktop_lib::run();
}
