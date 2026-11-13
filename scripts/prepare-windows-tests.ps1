$ErrorActionPreference = 'Stop'

# Tauri embeds Common Controls v6 in the application, but Cargo's unit-test
# executables do not inherit that resource. Without an activation context,
# TaskDialogIndirect (also used by rfd) fails at load time with 0xc0000139.
#
# Where Cargo places test executables is not stable across releases (target/debug/deps
# up to Rust 1.99, per-package build directories from 1.100), so take each path from
# the `executable` field Cargo reports instead of assuming a directory.
$messages = cargo test --workspace --lib --bins --locked --no-run --message-format=json-render-diagnostics
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
$executables = @(
    $messages |
        Where-Object { $_ -match '"reason":"compiler-artifact"' } |
        ForEach-Object { ConvertFrom-Json $_ } |
        Where-Object { $_.profile.test -and $_.executable } |
        ForEach-Object { $_.executable } |
        Sort-Object -Unique
)
if ($executables.Count -eq 0) {
    throw 'Cargo reported no test executables'
}
$testManifest = Join-Path $PSScriptRoot 'windows-test.manifest'
foreach ($executable in $executables) {
    Copy-Item -LiteralPath $testManifest -Destination "$executable.manifest"
    Write-Host "Activation context: $executable"
}
