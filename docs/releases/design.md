# 发布与更新设计

## 当前代码与参考项目

本次检查时，MarkLyra 的 `scripts/build-desktop.mjs` 通过 `--no-sign` 生成开发包；`.github/workflows/desktop-build.yml` 只提供手动开发构建和 Actions artifact。通用设置显示版本号，但旧检查按钮、`enableAutoUpdate` 未接入宿主业务。

Markune 的 `src-tauri/src/app_update.rs` 使用 Tauri updater，Rust 保存待更新对象，进程内互斥避免并发操作；Cargo 中另外启用更新器所用 reqwest 0.13 的系统代理和 SOCKS，这些做法可参考。它的面板摘要、本地截断版本说明不适用于当前需求。检查到的安装接口直接调用 `download_and_install`，重启接口直接调用 `app.restart()`；这些接口本身没有 MarkLyra 的逐窗口文稿关闭协议，不能直接移植。此结论仅针对查阅的更新模块，不是对 Markune 全应用行为的验收。

## 选择与理由

- 沿用 Tauri 官方更新格式与强制签名校验。无需自建服务，GitHub Release 的 `latest.json` 即可提供三平台清单。
- 分离构建、聚合、发布。矩阵 job 不同时写一个 `latest.json`，避免并发覆盖和缺失架构；单个聚合 job 检查所有产物后创建草稿。
- macOS ARM、Intel 分包；Windows 使用 NSIS 当前用户安装，避免 MSI/NSIS 并存时自动更新渠道选择不一致。
- macOS ad-hoc 与更新签名是两套用途不同的机制。前者满足平台基础代码签名要求，仍可能遇到 Gatekeeper；后者验证更新包发布来源。均不要求付费身份认证。Windows Authenticode 保持未启用。
- 发布版本必须为稳定 `X.Y.Z`；Tauri 默认版本比较只接受更高版本。更新器只接受官方仓库对应 Release 下载 URL，仍由签名确认文件内容。
- 公开稳定发布与开发包分离。基础公钥为空；Release 构建从仓库 Variable 生成只含公钥的 overlay。不会生成或上传生产私钥。

## 运行路径

隔离设置页只通过既有带 channel、instance 和有序请求的协议保存布尔开关、请求打开检查面板。原生 IPC、网络 URL、签名、公钥和待安装字节由可信 Shell/Rust 宿主掌握，没有给编辑器 iframe 增加 updater 插件权限。

`UpdateHost` 保存全应用更新状态，原子操作锁串行化检查、下载。开关使用既有安全偏好存储写入独立 `updates/preferences.json`。一个后台调度器每进程启动一次，30 秒后开始检查条件，再以 60 秒粒度唤醒，按 6 小时间隔检查；已有经验证下载时不会被定时检查丢弃。

检查/下载默认采用 reqwest 自动代理；网络故障后再用 `no_proxy` 尝试一次。检查请求超时 20 秒、连接超时 10 秒；下载总超时 20 分钟。所有请求仍执行 TLS 验证。若没有代理，网络故障也可能再直连一次。签名错误不作为网络故障重试。

下载通过插件 `download` 完成签名校验后才标记 ready。用户选择安装时请求现有 `windows::request_quit`；初始化未完成、文稿关闭被取消、退出消息投递失败都会撤销本次安装意图，保留已下载包。所有编辑窗口关闭后，宿主在 ExitRequested 阶段截住退出并调用插件安装；安装过程中继续拦截退出。macOS 成功后重启，Windows NSIS 由插件启动安装器并退出。不会在确认文稿关闭前调用安装器。

界面只显示当前/新版本、下载进度、检查结果和失败原因。自动检查失败不弹出打断编辑的对话框；下次手动检查可查看或重试。下载包保存在进程内，退出后不缓存，不支持断点续传。

## 发布验证

`release.mjs` 校验版本同步、公钥格式、三平台固定文件集合、源提交、URL、签名文件与 manifest 对应关系及 SHA-256。签名验证使用 Node 标准库 Ed25519 与 BLAKE2b，核对 minisign key ID、包签名和 trusted comment 签名；测试同时覆盖合成签名、篡改拒绝及真实 Tauri CLI 生成的临时签名。

`publish-release.mjs` 重新下载 GitHub 草稿原始附件并运行同一验证，防止只验证本地准备数据。发布工作流额外检查同一标签和 SHA 的构建成功记录，使用同一个并发组避免构建与发布同时操作。同一版本不自动覆盖已有 Release，签名不相符时停止。

这些自动验证不能证明对应操作系统已完成安装、IME、窗口保存与重启验收。CI 的 Intel 目标是在 macOS runner 上交叉编译，不能替代 Intel 实机；浏览器 WebKit 也不能替代 WKWebView。

## 依据

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)：平台清单、更新签名、下载与安装 API。
- [Tauri GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/)：跨平台 runner 构建与 GitHub Release 分发。
- [Tauri macOS 签名](https://v2.tauri.app/distribute/sign/macos/)：ad-hoc 配置与系统信任限制。
- [Tauri Windows 签名](https://v2.tauri.app/distribute/sign/windows/)：Authenticode 与系统信任机制。
- [reqwest ClientBuilder](https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html)：代理与超时控制。

代理优先级和下载后验证行为同时核对了锁定依赖 `tauri-plugin-updater 2.10.1`、`reqwest 0.13.5`、`hyper-util 0.1.21` 的本地源码；升级依赖后应复核。生产签名密钥、公开发布和三平台真实升级不属于本地代码验证能够替代的步骤。

## 本次本地验证记录（2026-10-20）

- TypeScript 类型检查、模块边界检查、355 个资源身份检查、受版本管理文件的来源检查通过；本次改动文件的 Biome 错误级检查通过。
- 现有 Vitest：127 个文件、1,532 项测试通过。
- 发布脚本：5 项测试通过，覆盖版本递增、独立 SDK 版本不受影响、配置生成、实际 Tauri CLI 签名、篡改拒绝和完整产物验证。
- Rust workspace：836 项通过、5 项既有忽略；更新模块后来补充代理依赖回归后，4 项定向测试通过。`cargo fmt` 通过；`cargo clippy --workspace --all-targets --locked` 完成，有既有 PDF/导出代码警告。
- Chromium/WebKit：通用设置明暗主题共 4 项、更新交互及深色弹窗/无原生 dialog 降级共 6 项通过。IPC 使用替身，没有执行真实安装。
- 前端生产构建和 macOS ARM 原生调试编译通过；调试编译使用 `--no-bundle`，不是正式安装包验收。
- 两份工作流通过本地 YAML 解析；未在 GitHub Actions 运行，未配置远端密钥、创建标签或发布 Release。远端只读检查确认仓库公开、默认分支为 `main`，当时尚无 Release。
- 尚未验证：Intel/Windows 原生构建与实机安装、真实系统代理下载与失效回退、真实安装器升级及重启。按照发布手册的隔离演练完成后才能将这些项目记为已验收。
