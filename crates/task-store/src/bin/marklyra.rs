//! `marklyra`: the task command line. The desktop app runs the same code for `--cli`.
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(task_store::cli::main(args));
}
