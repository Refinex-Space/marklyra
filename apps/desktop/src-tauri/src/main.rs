#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--agent-mcp-stdio") {
        if marklyra_desktop_lib::agents::proxy_main().is_err() {
            std::process::exit(1);
        }
        return;
    }
    marklyra_desktop_lib::run();
}
