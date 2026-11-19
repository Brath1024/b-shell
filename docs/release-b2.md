## b-shell 5.11.8-bshell.2

基于 Electerm 5.11.8 的 Windows 终端管理工具。本次更新集中在 **AI 供应商**、**Xshell 迁移体验** 与 **品牌**。

### 本次新增

- **AI 供应商：DeepSeek 官方 / OpenCodeGo**
  - DeepSeek 官方：`https://api.deepseek.com`，模型 `deepseek-flash`、`deepseek-v4-pro`；请求体默认带 `thinking: { type: "disabled" }`，日常命令生成更快更省。
  - OpenCodeGo：`https://opencode.ai/inference/go/openai/v1`，内置 12 个模型（`deepseek-v4.1-flash`、`deepseek-v4-pro`、`glm-5.3`、`kimi-k3`、`qwen3.8-max`、`gpt-6-luna`、`claude-haiku-5-5`、`grok-4.7`、`minimax-m3`、`mimo-v2.6-pro`、`longcat-2.0`、`step-5-preview`），自动附带真实 UA 与 `x-opencode-session` 请求头。
  - 入口：设置 → AI，或底部「AI」按钮 →「AI Config」，选中预设后填入 API Key 即可。
- **Xshell 导入更好用**
  - 首次打开首页弹出「从 Xshell 一键搬家」，点「开始导入」即可；「查看导出与导入方式」直达文档。
  - 支持把 `.xts` 备份（或整个 `Sessions` 目录）**直接拖进窗口**，松手后立刻解析并写入书签，不需要再点确认。
  - 中文环境下的导入向导不再是英文（修复 `window.getLang()` 判断语言的问题）。
- **终端常驻矩阵水印**：终端背景始终显示半透明的 `Brath Shell` 矩阵水印，不影响选区与鼠标操作。
- **品牌图标**：全面改用荔枝宇宙（Litchi Universe）logo。

### 下载与安装

- **便携版**（免安装，解压即用）：下载 `b-shell-5.11.8-bshell.2-win-x64.7z.001` 与 `.002`，用 7-Zip 选第一个分卷解压，运行 `b-shell.exe`。
- **安装包**（开始菜单快捷方式、可卸载）：下载 `b-shell-5.11.8-bshell.2-win-x64-installer.7z.001` 与 `.002`，解压出 `b-shell-5.11.8-bshell.2-win-x64-installer.exe` 后双击安装。
- 因 Gitee 单文件 100 MB 限制，凡超过 100 MB 的产物都以 7-Zip 分卷上传；**分卷必须全部下载到同一目录**再解压。

### 资产

| 文件 | 大小 | SHA256 |
| --- | --- | --- |
{{ASSETS}}

### 从 Xshell 迁移

1. Xshell 菜单「文件 → 导出」，生成 `.xts` 备份；
2. 打开 b-shell，把 `.xts` 拖进窗口（或首页弹窗点「开始导入」→ 选择备份文件）；
3. 核对「会话 / SSH / 密码已解密 / 密钥已导入」统计后，会话即写入书签，双击即可连接。

详细说明见仓库 `docs/xshell-import.md`，使用手册见 `docs/ppt/b-shell-guide.pdf`。

### 已知限制

- 端口转发、登录脚本、快捷命令集、配色/字体不从 Xshell 迁移；
- Xshell 5 及更早的密码算法、设置了口令的 `.pri` 只能迁移元信息，需要补一次凭据；
- 自动更新仍关闭，请手动下载新版本覆盖安装（`%APPDATA%\b-shell` 数据不受影响）。
