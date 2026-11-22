# U2 Windows 设置显示暂不可用的拖放选项

**P2 · 体验缺陷** · [返回任务索引](README.md)

## 现状

Windows 界面的「偏好设置 → 文件 → 拖放行为」显示可配置的「当拖入文件夹时」「当拖入 Markdown 文件时」等选项。对应的非图片文件和文件夹原生拖放尚未接入，用户改完设置也得不到选项描述的行为。巡检在 Windows 模拟宿主看到了设置页，平台能力依据代码和现有文档确认。[设置页](../../../apps/desktop/src/features/settings/runtime-preferences/settings-page.ts#L184) · [原生拖放入口](../../../apps/desktop/src-tauri/src/platform/native_drop.rs#L7) · [平台说明](../../WINDOWS-SHELL.md#L43)

## 验收

- Windows 设置页明确标注当前不可用的拖放行为，并指向已有的打开文件或打开文件夹入口。
- macOS 继续显示和使用其支持的拖放选项。Windows 的图片导入路径仍可使用。
- 在 Windows 模拟宿主确认设置展示。原生拖放能力由对应宿主实测记录。
