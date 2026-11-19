## b-shell 5.11.8-bshell.2

基于 Electerm 5.11.8 的 Windows 终端管理工具。本版重点：**修复导入后书签变「本地」的严重问题**、**AI 供应商**、**Xshell 迁移体验**、**品牌**。

### 严重修复（务必升级）

- **导入后书签显示「本地」、点了没反应**：已修复。原因是数据库位置与加密密钥不在同一目录，一旦用不同的 `--user-data-dir` 启动（测试、绿色启动），整库会被另一把密钥读写，所有行解密失败后退化成只有 id 的空壳。
  - 现在数据库固定放在用户数据目录，与密钥始终同进同出；
  - 解密失败的行不再变成空壳，而是直接丢弃并记录日志；
  - **重新导入一次 `.xts` 即可就地修复历史上坏掉的书签**（同 id 会被覆盖修复，不再被“已存在”跳过）。

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
- **新图标**：荔枝红底 + 终端窗口 + 绿色提示符，配套手写 SVG，与荔枝宇宙配色一致。

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
- 仅发布到 Gitee；GitHub 只同步源码，不分发安装包。
