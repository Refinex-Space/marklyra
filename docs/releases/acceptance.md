# 正式发布前的隔离升级演练

草稿不能被匿名客户端读取，因此需要一个公开但**不设为 Latest 的预发布验收版本**。以下步骤由维护者主动执行，会创建 GitHub 预发布记录；仅对已经决定公开的发布候选包使用。正式客户端始终读取 `/releases/latest/download/latest.json`，不会选中这个预发布版本。

必须在专用系统账户、测试机或虚拟机中安装演练。MarkLyra 的数据目录使用固定 `marklyra` 名称，**仅更换 bundle identifier 不能隔离正式用户数据**。不要在日常写作账户直接覆盖正在使用的应用。三个平台分别完成演练。

以下示例以待发布 `v0.1.1` 为例，每次替换成自己的版本。首次 `v0.1.0` 同理。

## 1. 准备验收附件

确认完整正式草稿已经构建成功。目录应全新，避免混入上次产物：

```sh
mkdir -p .release/acceptance-v0.1.1
gh release download v0.1.1 --repo Refinex-Space/marklyra \
  --dir .release/acceptance-v0.1.1
```

把下载清单中的 URL 指向预发布验收标签，重新生成校验和。安装包和 `.sig` 字节不变：

```sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const directory = '.release/acceptance-v0.1.1';
const path = `${directory}/latest.json`;
const manifest = JSON.parse(readFileSync(path, 'utf8'));
if (manifest.version !== '0.1.1') throw Error('Wrong candidate version');
for (const entry of Object.values(manifest.platforms)) {
  entry.url = entry.url.replace('/download/v0.1.1/', '/download/v0.1.1-acceptance/');
}
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(`${directory}/SHA256SUMS`, readdirSync(directory).filter(name => name !== 'SHA256SUMS').sort().map(name =>
  `${createHash('sha256').update(readFileSync(`${directory}/${name}`)).digest('hex')}  ${name}\n`
).join(''));
JS
```

创建预发布。`CANDIDATE_SHA` 使用草稿 `source.json` 中的提交：

```sh
CANDIDATE_SHA=$(node -p "JSON.parse(require('fs').readFileSync('.release/acceptance-v0.1.1/source.json','utf8')).commit")
gh release create v0.1.1-acceptance .release/acceptance-v0.1.1/* \
  --repo Refinex-Space/marklyra --target "$CANDIDATE_SHA" \
  --prerelease --latest=false --title 'MarkLyra v0.1.1 acceptance' \
  --notes '仅供隔离环境升级验收，不用于日常安装；不代表正式版本已验收。'
```

构建工作流忽略带 `-` 或 `+` 的标签，不会为该验收标签再触发正式构建。正式 `v0.1.1` 草稿保持不变。

## 2. 构建临时低版本验收客户端

在构建机使用当前源代码生成一个版本为 `0.0.0` 的临时客户端。其更新端点指向上述预发布清单，仍使用相同正式公钥和签名验证。先按发布手册设置 `MARKLYRA_UPDATER_PUBLIC_KEY`，然后：

```sh
pnpm release:prepare
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('.release/tauri.release.json', 'utf8'));
config.version = '0.0.0';
config.bundle.createUpdaterArtifacts = false;
config.plugins.updater.endpoints = [
  'https://github.com/Refinex-Space/marklyra/releases/download/v0.1.1-acceptance/latest.json'
];
writeFileSync('.release/tauri.acceptance.json', JSON.stringify(config, null, 2) + '\n');
JS
cd apps/desktop
pnpm exec tauri build --target aarch64-apple-darwin --bundles app,dmg \
  --config ../../.release/tauri.acceptance.json -- --locked
```

Intel 换为 `x86_64-apple-darwin`。Windows 在 Windows 主机用 `x86_64-pc-windows-msvc` 和 `--bundles nsis`，用等价环境变量方式提供公钥。验收客户端不生成 updater 包，不需要私钥；macOS 保留 ad-hoc 签名。

配置 overlay 不修改源码版本。通用设置中的静态版本行仍来自源 package.json；更新对话框的当前版本来自原生包，应为 `0.0.0`。验收只使用临时客户端的更新对话框，不把该客户端上传到正式 Release。

## 3. 验证升级与取消

1. 将临时客户端安装到隔离账户或虚拟机，确认更新对话框显示 `0.0.0`，检查后显示候选 `0.1.1`。
2. 自动检查关闭时重新启动，确认没有自动更新请求；开启后确认会提示而不下载。
3. 配置一个实际可用的系统静态代理，确认代理日志中存在 GitHub/附件 CDN 下载请求。停止代理后测试直连回退；断网时测试错误提示与恢复后的重试。不要把代理认证信息写入截图或验收记录。
4. 下载完成后先测试取消安装：打开多个含未保存修改的临时文稿，选择安装，在保存/关闭流程中取消；应用应继续运行且可以再次安装。
5. 再次选择安装，逐个处理文稿，确认完成升级；重启后对话框显示 `0.1.1`，文件、偏好和恢复行为正常。安装后的正式候选包已恢复正式 `/latest/` 端点。
6. 签名拒绝测试在单独的验收预发布附件副本进行：破坏签名后检查下载不得进入可安装状态。不要修改正式草稿或现有正式附件。恢复原签名和包后重新验收。

记录操作系统版本、架构、起止版本、网络/代理场景、文稿关闭结果与安装后版本。验收完成后可由维护者删除临时预发布记录和标签，清理隔离账户内临时安装。不要自动清理正式文稿、正式安装或生产签名密钥。

完成本节并不自动发布正式版；回到 [发布手册](README.md) 运行手动发布工作流。
