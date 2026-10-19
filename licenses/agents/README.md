# ACP 智能体资源

宿主安装、stdio 传输与 MCP 桥的基础实现参考并改编自 用户指定的本地 Markune 参考仓库（Apache-2.0）；保留许可证于 markune-Apache-2.0.txt。本项目重新实现窗口能力校验、文档工具、会话归档、上下文与 UI，不包含画图工具。

catalog.json 来自 ACP 官方 registry 的 Markune 固定快照（2026-10-07），保留源 URL、commit、发行方、版本与许可证字段。第三方智能体在用户选择后独立安装，其许可证及服务条款仍由各发行方提供。

智能体图标取自 Markune 使用的 @thesvg/react 3.2.8（MIT，https://github.com/glincker/thesvg），转换为静态 SVG，保留原始图形与品牌名称。各品牌商标属于其权利人；图标不表示背书。

Copilot 与 Grok 的静态 SVG 仅将白色单色填充调整为深色（#111），以适配应用共用的白色图标底板；原始路径轮廓保持不变，原始与适配后的 SHA-256 记录于 licenses/agents/icons.json。

参考仓库来源：https://github.com/Refinex-Space/markune。改编文件在文件头标明 MarkLyra 修改；UI、当前文档能力和精确编辑工具为本项目实现。

前端终端组件 @xterm/xterm 5.5.0 与 @xterm/addon-fit 0.10.0 的 MIT 许可分别保留于 xterm-MIT.txt 和 xterm-addon-fit-MIT.txt；这些通知也随 public/agents/licenses 进入应用资源。
