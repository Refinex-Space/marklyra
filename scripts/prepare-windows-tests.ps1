$ErrorActionPreference = 'Stop'

# Tauri embeds Common Controls v6 in the application, but Cargo's unit-test
# executables do not inherit that resource. Without an activation context,
# TaskDialogIndirect (also used by rfd) fails at load time with 0xc0000139.
cargo test --workspace --lib --bins --locked --no-run
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
$testManifest = Join-Path $PSScriptRoot 'windows-test.manifest'
Get-ChildItem -LiteralPath 'target/debug/deps' -Filter '*.exe' | ForEach-Object {
    Copy-Item -LiteralPath $testManifest -Destination "$($_.FullName).manifest"
}
