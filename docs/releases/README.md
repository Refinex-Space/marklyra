# MarkLyra 发布与更新手册

适用仓库：[`Refinex-Space/marklyra`](https://github.com/Refinex-Space/marklyra)。维护日期：2026-10-21。

本项目采用 GitHub Release 分发免费开源桌面版本。macOS 使用 ad-hoc 本地签名，不购买 Apple 开发者证书、不做公证；Windows 不要求 Authenticode 证书。应用内更新使用另一套免费的 Tauri/minisign 密钥校验来源，不能省略。

## 发布结果

| 平台 | 首次安装 | 应用内更新 | 清单平台名 |
| --- | --- | --- | --- |
| macOS Apple Silicon | `MarkLyra_X.Y.Z_aarch64.dmg` | `MarkLyra_X.Y.Z_aarch64.app.tar.gz` + `.sig` | `darwin-aarch64` |
| macOS Intel | `MarkLyra_X.Y.Z_x64.dmg` | `MarkLyra_X.Y.Z_x64.app.tar.gz` + `.sig` | `darwin-x86_64` |
| Windows x64 | `MarkLyra_X.Y.Z_x64-setup.exe`（NSIS，当前用户） | 同一个 `.exe` + `.sig` | `windows-x86_64` |

另有 `latest.json`、`source.json`、`SHA256SUMS`，每个完整 Release 共 11 个附件。macOS 两种架构分别发布，不使用 Universal 包。Windows ARM64、32 位、Linux 不属于当前发布矩阵；开发流程中的 MSI 不属于这套自动更新渠道。

固定更新入口：

```text
https://github.com/Refinex-Space/marklyra/releases/latest/download/latest.json
```

必须使用可匿名下载附件的公开仓库。Git SSH remote 用于维护者推送代码，应用不使用 SSH，也不内置 GitHub Token。草稿、预发布版本不会作为正式更新入口。

## 首次配置（只需一次）

### 1. 准备维护环境

安装 Node.js 24、pnpm 10.33.0、Rust stable（至少满足根 `Cargo.toml` 的 MSRV）、Git、GitHub CLI。远程 CI 的 Windows runner 自带编译工具，macOS runner 自带 Xcode。确认 `origin` 指向：

```sh
git remote -v
# git@github.com:Refinex-Space/marklyra.git
pnpm install --frozen-lockfile
gh auth status
```

首次发布前，确认第三方代码、资源及通知符合项目的实际分发授权；自动资源校验验证字节身份，不代替授权确认。不随发布删除原始许可文件。

### 2. 创建独立的更新签名密钥

在仓库外选择一个安全目录（以下命令以 macOS 维护机为例）。目录已有文件时不要覆盖，不使用 `--force`。

```sh
mkdir -p "$HOME/.config/marklyra-signing"
chmod 700 "$HOME/.config/marklyra-signing"
pnpm --filter @marklyra/desktop exec tauri signer generate \
  -w "$HOME/.config/marklyra-signing/updater.key"
chmod 600 "$HOME/.config/marklyra-signing/updater.key"
```

交互设置密码，备份私钥、密码及对应 `.pub` 公钥。生成工具可能在终端显示密钥，不录屏、不复制到 Issue、日志或聊天。不要把密钥放进本仓库。

进入仓库 **Settings → Secrets and variables → Actions**，添加：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Repository variable | `MARKLYRA_UPDATER_PUBLIC_KEY` | `updater.key.pub` 文件的完整内容，不是文件路径 |
| Repository secret | `TAURI_SIGNING_PRIVATE_KEY` | `updater.key` 文件的完整内容，不是维护机路径 |
| Repository secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成时设置的密码；无密码密钥对应空值 |

公钥可以公开，私钥必须保密。不要随每个版本重新生成密钥；已安装客户端只信任构建时嵌入的公钥。丢失私钥后无法直接给旧客户端发布可信更新，必须另行设计密钥迁移或要求手动安装。

本流程不需要 `APPLE_CERTIFICATE`、`APPLE_ID`、公证密钥、Windows 证书或个人 GitHub 发布 Token。Actions 使用仓库内置 `GITHUB_TOKEN`。

### 3. 配置 Actions 与发布环境

允许 GitHub Actions 运行；工作流在上传 Release 的 job 中声明 `contents: write`。发布 job 同时需要 `actions: read`，用于确认相同标签、相同提交已构建成功。

创建名为 `production-release` 的 Environment。可按团队需要添加审核人；工作流本身始终需要手动运行并勾选平台验收。将工作流提交到默认分支后，GitHub 才会显示手动发布入口。

## 每次更新版本的标准步骤

### 发布分支

不需要专门创建 DEV 分支。正式版本从已完成验证且与远端同步的 `main` 创建版本标签；发布工作流由标签触发，不由分支名称触发。日常开发可以使用功能分支，但应先合并回 `main` 再发布。不要将未提交改动或尚未验收的开发分支作为发布来源。

涉及 Windows 文件系统兼容性时，可先手动运行 `Verify release platform compatibility`（`release-preflight.yml`）。它执行 Windows Rust 全套测试，不创建标签、签名安装包或 Release；通过后再开始正式打标签流程。

### 1. 完成改动、递增版本

确保当前分支和工作区内容就是本次要发布的版本：

```sh
git status --short
pnpm release:version 0.1.1
pnpm release:check
```

将例子中的 `0.1.1` 换成实际版本。只接受稳定的 `X.Y.Z`，不得重用或降低版本。脚本同步根 `package.json`、桌面 `package.json`、Tauri 配置、Rust workspace 和 workspace 成员的 `Cargo.lock` 版本；编辑器 SDK 具有独立版本，不跟随桌面版机械递增。初始 `0.1.0` 仅在从未推送过对应标签时可以直接使用；构建失败后需要修正源码时，使用递增版本，不移动已经推送的标签。

编写 `docs/releases/vX.Y.Z.md`。它会成为 GitHub Release 说明；内容应写实际改动、安装提示、已知限制和真实验证结果。应用内面板不会显示该版本摘要。

### 2. 本地验证

```sh
pnpm install --frozen-lockfile
pnpm release:check v0.1.1
pnpm check:resources
pnpm typecheck
pnpm check:boundaries
pnpm test
pnpm test:release
node --test scripts/lib/general-preferences-source.test.mjs scripts/lib/prepare-preferences-runtime.test.mjs
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked
cargo test --workspace --lib --bins --locked -- --test-threads=1
pnpm prepare:runtime
pnpm exec playwright test -c playwright.desktop.config.ts tests/desktop-e2e/general-settings-layout.spec.ts tests/desktop-e2e/app-updates.spec.ts
pnpm --filter @marklyra/desktop build
```

浏览器测试服务器关闭了文件监视，修改代码后必须使用新启动的测试服务器，不能复用过期实例。不要关闭其他人的应用或开发实例；可使用独立端口的本地 Playwright 配置。浏览器测试使用原生 IPC 替身，不代表真实系统安装、代理和重启已验证。

当前仓库已有部分 Rust PDF/导出代码的 `dead_code`、`needless_borrow` 警告；发布工作流运行 clippy 并保留诊断，暂未用 `-D warnings` 阻断既有警告。发布前应阅读输出，不把警告当作已修复。

Rust 发布测试串行执行，因为文件句柄上限测试统计整个测试进程的句柄，其他并行夹具会干扰计数；串行执行不跳过测试。

在 Windows 本地运行上述 Rust 测试前，先在 PowerShell 执行 `./scripts/prepare-windows-tests.ps1`。它预编译测试并为测试 EXE 添加通用控件 v6 清单，避免原生对话框依赖在测试程序启动时出现 `0xc0000139`。正式应用已有 Tauri 嵌入的清单，不需要这些测试旁置文件。

### 3. 提交代码并推送版本标签

先审查 diff，确认无密钥、`private/`、`artifacts/`、构建产物，再按项目流程提交和合并。以下命令假定发布代码已经位于 `main`：

```sh
git switch main
git pull --ff-only
# 如版本修改尚未提交，先审查、暂存并提交本次发布变更。
pnpm release:check v0.1.1
git status --short
# 工作区应为空，且 HEAD 已包含对应 docs/releases/v0.1.1.md。
git push origin main
git tag -a v0.1.1 -m "MarkLyra v0.1.1"
git push origin v0.1.1
```

推送 `v*` 标签触发 **Build MarkLyra release draft**：

1. 三个平台分别运行源码检查、单元测试和构建，生成签名更新包。
2. 产物暂存到 Actions artifacts，单个平台失败不会产生一个半成品正式 Release。
3. 聚合 job 生成完整 `latest.json`，验证全部三份更新签名、文件集合、SHA-256、源提交和版本。
4. 创建带全部附件的 **draft Release**；不会直接上线，不覆盖已有 Release。

等待三个平台和聚合 job 全部成功。可查看：

```sh
gh run list --workflow release.yml --repo Refinex-Space/marklyra
gh release view v0.1.1 --repo Refinex-Space/marklyra
```

### 4. 验收草稿

从 GitHub 草稿下载相应安装包，在 macOS ARM、macOS Intel、Windows x64 分别验证：首次安装、启动编辑、保存、设置页，以及本次改动涉及的功能。

更新验收至少包括：旧版本检测到新版本、当前版本不提示降级、代理可用时下载、代理失效时直连回退、断网报错可重试、签名不匹配拒绝安装；打开有修改文稿和多个窗口时，安装走已有关闭确认，取消关闭能取消安装；确认关闭后完成安装并重新打开。关闭自动检查后重启，不应主动联网检查。下载完成后退出应用会丢弃内存中的更新包，需要重新下载。

**草稿附件不能被普通已安装客户端从 `/latest/` 自动发现。** 首次接通时按 [隔离升级演练](acceptance.md) 使用独立系统账户或虚拟机、公开预发布验收附件和临时客户端验证升级链路；正式稳定端点保持不变，不在客户端嵌入访问草稿的 Token。没有这些验收条件时，记录未验证项，不勾选工作流中的验收承诺。首次公开版没有可供线上升级的旧版，应先完成上述隔离升级演练。

### 5. 手动发布已验收的草稿

在 GitHub **Actions → Publish verified MarkLyra release → Run workflow**：选择默认分支，填写 `v0.1.1`，验收完成后勾选 `accepted`；配置了 Environment 审核人时完成审核。也可以运行：

```sh
gh workflow run publish-release.yml --ref main \
  -f tag=v0.1.1 -F accepted=true \
  --repo Refinex-Space/marklyra
```

发布 job 会验证同标签同提交的构建已成功，再从草稿重新下载全部附件，校验签名、公钥、清单、SHA-256 和源提交；通过后才取消 draft 并设为 Latest。不要绕过该步骤直接点击草稿页面的 Publish。

### 6. 发布后核验

确认 Release 为公开的稳定版，下载链接可匿名访问，且 `latest.json` 的版本和三平台 URL 正确：

```sh
gh release view v0.1.1 --repo Refinex-Space/marklyra
curl --fail --location https://github.com/Refinex-Space/marklyra/releases/latest/download/latest.json
```

使用真实已安装旧版执行一次检查、下载和升级。检查当前版本是否显示新版本，并确认文稿和偏好正常。没有旧版首次安装时，应记录这个线上升级验收缺口。

## 本地构建带更新能力的包

普通 `pnpm build:desktop` 仍构建开发包，使用 `--no-sign`，不作为 Release 入口。基础配置公钥为空，开发包检查更新会明确提示未配置，不伪装成“已是最新”。

若要在维护机生成带更新能力的包，先设置公钥并生成配置，再通过环境变量传入私钥文件路径和密码。下例不把私钥内容写进命令历史：

```sh
export MARKLYRA_UPDATER_PUBLIC_KEY="$(cat "$HOME/.config/marklyra-signing/updater.key.pub")"
pnpm release:prepare
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.config/marklyra-signing/updater.key"
# 以安全方式设置 TAURI_SIGNING_PRIVATE_KEY_PASSWORD，避免将明文密码写进历史。
cd apps/desktop
pnpm exec tauri build --target aarch64-apple-darwin --bundles app,dmg \
  --config ../../.release/tauri.release.json -- --locked
```

Windows 在 Windows 主机使用 `x86_64-pc-windows-msvc`、`--bundles nsis` 和对应 PowerShell 环境变量。临时配置只写入已忽略的 `.release/`，不修改正式配置、不存储私钥。

## 首次安装的系统提示

- **macOS**：将 DMG 中的应用拖到“应用程序”。首次打开如被阻止，到“系统设置 → 隐私与安全性”中对 MarkLyra 选择“仍要打开”，再确认打开；具体文字依系统版本而异。ad-hoc 不等于 Apple 认可或公证，不能承诺首次启动完全无提示。不提供全局关闭 Gatekeeper 的步骤。
- **Windows**：运行对应 NSIS 安装包。若 SmartScreen 提示未知发布者，在核实官方下载来源后选择“更多信息 → 仍要运行”（如果系统提供）。有些设备没有此提示，组织策略或 Smart App Control 也可能禁止用户自行放行；不要将“总能点信任”写成兼容性保证。

Windows 的目录能力句柄会阻止所持目录被移动或删除，这是文件系统沙箱的保护机制。对包含已打开文稿的目录进行重命名、移动或回收站操作前，应先保存并关闭相关文稿；若目录还作为其他窗口的工作区打开，也需先关闭该工作区。被系统拒绝的操作不会提交文稿位置变更。不要通过放宽句柄共享权限来绕过保护。

## 自动检查与本机代理

“设置 → 通用 → 关于 MarkLyra”提供手动检查按钮和持久化开关。自动检查默认关闭；开启后，启动约 30 秒检查一次，此后每 6 小时检查。运行中开启最迟约 60 秒进入检查；关闭不主动取消已经发出的请求。自动发现只显示轻量提示，用户决定下载和安装。

检查和下载均使用更新器自己的 reqwest 0.13 客户端，启用 `system-proxy` 和 `socks`：优先读取进程环境中的 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`（以及相应小写变量），无相应环境配置时采用系统静态代理，遵守 `NO_PROXY`。代理地址可以是本机代理客户端监听的 `127.0.0.1` 端口。GUI 从 Finder 或开始菜单启动时通常不继承终端临时设置，请在代理软件中启用系统代理，或从设置了变量的进程启动应用。

不扫描 Clash 等软件的端口，不覆盖系统代理，不关闭 TLS 校验。不支持自动执行 PAC/WPAD 脚本；只有 PAC 或仅在终端生效的配置不能保证 GUI 获得代理。网络错误后只尝试一次直连；两次都失败则显示错误。下载重试从头开始，不支持断点续传。代理能否提速取决于实际线路，不能保证更快。

## 失败恢复

- 构建失败：修复问题后优先使用新版本和新标签；不移动已公开标签。尚未产生 Release 的纯网络失败，可在 Actions 重跑失败 job。
- 草稿创建中断或已存在：流程不会覆盖旧附件。先核对草稿和 Actions 状态，维护者显式删除尚未发布的废弃草稿后再重试；不要删除公开 Release 来复用版本号。
- 密钥缺失或公私钥不匹配：构建或聚合签名校验会失败；修正 Secrets/Variables，不关闭验证。
- 正式版本有缺陷：优先发布递增版本的修复版。必要时可由维护者将上一稳定版恢复为 Latest 以阻止继续推广坏版本；已经升级的客户端不会自动降级，需要新修复版本或手动安装。
- 安装失败：显示错误并退出已关闭文稿的应用，重新启动后检查或手动安装。恢复数据仍按现有应用机制保存，不把安装成功等同于系统级事务回滚。

设计依据与实现边界见 [发布与更新设计](design.md)。
