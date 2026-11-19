# b-shell

> Brath 终端管理工具 —— Windows / macOS 双端，基于 [Electerm](https://github.com/electerm/electerm) 二次开发，内置 **Xshell 会话一键导入**。

b-shell 是一个开源终端 / SSH / SFTP / Telnet / 串口 / RDP / VNC 客户端。相比上游 Electerm，b-shell 针对长期使用 Xshell 的用户做了迁移优化：读取本机 Xshell 的 `.xsh` 会话文件，把主机、端口、用户名、密码和文件夹结构一次性导入，导入后可以直接连接，不需要逐个重建会话。

[![Gitee](https://img.shields.io/badge/repo-gitee.com%2FGuoqing--Li%2Fb--shell-c71d23)](https://gitee.com/Guoqing-Li/b-shell)
[![GitHub](https://img.shields.io/badge/mirror-github.com%2FBrath1024%2Fb--shell-24292f)](https://github.com/Brath1024/b-shell)

> 代码同时托管在 Gitee（主）与 GitHub（镜像），两个仓库保持同一提交进度。

---

## 功能

- **Xshell 一键导入**：自动扫描 Xshell 5 - 9 的会话目录，解密密码（RC4 + SHA-256 校验），还原分组目录，重复导入自动去重；首屏会主动提示，也可以把 `.xts` 备份直接拖进窗口，松手即解析、即写入书签。详见 [Xshell 导入文档](docs/xshell-import.md)。
- 多协议：SSH、SFTP、Telnet、Serial Port、RDP、VNC、Spice、FTP、本地终端。
- 书签与分组：无限层级分组、拖拽整理、颜色/图标标记、批量打开。
- SSH 隧道、跳板机（connection hopping）、X11 转发、Agent 转发、多套认证配置。
- 快捷命令、命令自动补全、触发器、全局搜索、分屏、标签页批量操作。
- 内置 AI 助手：OpenAI 兼容接口，内置 **DeepSeek 官方 API** 与 **OpenCodeGo** 预设，也支持任意自建端点。
- 终端背景常驻 **矩阵水印（Brath Shell）**，视觉上区分 b-shell 与其他终端窗口，不影响命令输出与复制。
- 品牌图标完全复用荔枝宇宙（Litchi Universe）的标识。
- Windows（安装包 / 免安装便携版）与 macOS（dmg）构建。

## 下载与安装

最新版本在 [Gitee 发行版](https://gitee.com/Guoqing-Li/b-shell/releases) 下载。GitHub 镜像只同步源码，不提供发行包。

当前版本 **5.11.8-bshell.3**：<https://gitee.com/Guoqing-Li/b-shell/releases/tag/v5.11.8-bshell.3>

> 发行版只提供**一个文件**（87.8 MB，未分包）：`b-shell-5.11.8-bshell.3-win-x64-portable.7z`。Gitee 单个资产上限 100 MB，这一版已经压到限制以内，不再需要分卷。

| 平台 | 产物 |
| --- | --- |
| Windows x64（免安装，推荐） | `b-shell-5.11.8-bshell.3-win-x64-portable.7z`（87.8 MB，单文件）—— 用 7-Zip 解压到任意目录，双击 `b-shell.exe` |
| macOS | `b-shell-<version>-mac-*.dmg` |
| Linux | `b-shell-<version>-linux-*.AppImage` / `.deb` |

Windows 上的 7-Zip / Bandizip / NanaZip 均可解压 `.7z`。校验和见发行版说明。

关于体积：Electron 44 的运行时（`b-shell.exe` 单文件 235 MB）本身就占了压缩后的大头，即使按最省的方式打包（去掉 RDP 背景 wasm、ARM64 预编译、Vulkan/SwiftShader 回退、sourcemap）也仍需 ~88 MB；要再小就只能裁掉 Chromium 的 `resources.pak`（11.8 MB，不可再压缩）或 GPU DLL，会牺牲兼容性，因此不做。

## 从源码构建

需要 Node.js ≥ 16（推荐 20 或 22）、npm、npm 可访问的网络环境。

```bash
git clone git@gitee.com:Guoqing-Li/b-shell.git
cd b-shell
npm install

# 开发模式（Vite dev server + Electron）
npm start

# 打包当前平台的安装包
npm run dist:win   # Windows x64
npm run dist:mac   # macOS
npm run dist:linux # Linux
```

`npm run dist:*` 会先执行 `npm run b`（清理 + 编译主进程/预加载脚本 + 生成静态资源），再调用 `electron-builder`。构建配置位于 [src/build/electron-builder.json](src/build/electron-builder.json)。

## 把 Xshell 数据迁移过来

三种入口，任选一种：

1. 首次启动 b-shell 时，首页会弹出「从 Xshell 一键搬家」，点「开始导入」即可；
2. 把 `xbackup*.xts` 备份（或整个 `Sessions` 目录）**直接拖进窗口**，松手后自动解析并写入书签；
3. 左侧书签面板工具栏 → 点击 **Windows 图标按钮**（「从 Xshell 导入」）→ 确认扫描结果 → 「一键导入」。

- 自动扫描：`文档\NetSarang Computer\<版本>\Xshell\Sessions`、OneDrive 文档目录、`%APPDATA%\NetSarang\Xshell\Sessions`
- 备份文件：点「选择备份文件」直接选 Xshell 导出的 `xbackup*.xts`（或 `.zip`），无需解压、无需装回 Xshell
- 手动指定：在对话框顶部填入 `Sessions` 目录，或设置环境变量 `XSHELL_SESSION_PATH`
- 密码：仅当前 Windows 账户加密且未设 Xshell 主密码的会话可以解密，其余会话会标记「需重录密码」，首次连接时输入一次即可
- 私钥：会话使用的 `UserKey` 会自动从 `com\SECSH\UserKeys` 找到并转换为 OpenSSH 格式内嵌到书签，换机器不用再拷贝密钥文件
- 重复导入：按会话文件路径去重，随时可以再导入增量会话

完整字段映射、手动导入（JSON / ssh config / 快速连接）与常见问题见 **[docs/xshell-import.md](docs/xshell-import.md)**。二次开发（构建流程、命名约定、导入实现细节）见 **[AGENTS.md](AGENTS.md)**，本次交付的验证证据与遗留项见 **[docs/handover.md](docs/handover.md)**。

想直接看「怎么用」：**[docs/ppt/b-shell-guide.pdf](docs/ppt/b-shell-guide.pdf)**（15 页图解：新建连接、连接服务器、传文件、配置 AI、用 AI 操作命令、从 Xshell 迁移、分发给用户），可编辑版是 [b-shell-guide.pptx](docs/ppt/b-shell-guide.pptx)。

## 与上游 Electerm 的差异

- 产品名、应用标识、安装包名、可执行文件名、协议前缀（`b-shell://`）、数据目录改为 b-shell 自有标识，可与官方 Electerm 同时安装、互不干扰。
- 新增 Xshell 会话导入（主进程解析 + 密码解密 + 私钥转换 + `.xts` 备份读取 + 渲染层导入向导），详见 [docs/xshell-import.md](docs/xshell-import.md)。
- 自绘 b-shell 品牌图标（应用图标、窗口水印、托盘图标、Windows `.ico`、macOS `.icns`、Linux 多尺寸 PNG），资源不再依赖上游 npm 包。
- 移除上游的自动发布与赞助相关配置，构建目标指向本仓库。
- 其余功能与上游保持一致，上游更新可以继续合并：本仓库基于 Electerm `5.11.8`。

## 项目结构

```text
src/
  app/         Electron 主进程：窗口、IPC、数据库、SSH/SFTP 会话、xshell-import.js
  client/      渲染进程（React + antd + Vite）：组件、store、主题
  build/       构建脚本、electron-builder 配置与品牌图标资源（src/build/resources）
  test/        单元测试与集成测试
docs/          使用文档（Xshell 导入）
```

界面使用的图标源文件在 [src/client/views/images](src/client/views/images)，打包/安装器用图标在 [src/build/resources](src/build/resources)（含 Windows `.ico`、macOS `.icns`、Linux 多尺寸 PNG）。

Xshell 导入相关代码：

- 主进程实现：[src/app/lib/xshell-import.js](src/app/lib/xshell-import.js)
- `.xts` / ZIP 读取：[src/app/lib/zip-read.js](src/app/lib/zip-read.js)
- IPC 注册：[src/app/lib/ipc.js](src/app/lib/ipc.js)（`loadXshellSessions`）
- 渲染层 store：[src/client/store/bookmark.js](src/client/store/bookmark.js)（`loadXshellSessions` / `importXshellSessions`）
- 导入向导：[src/client/components/xshell-import/index.jsx](src/client/components/xshell-import/index.jsx)
- 首屏迁移提示：[src/client/components/xshell-import/quick-import.jsx](src/client/components/xshell-import/quick-import.jsx)
- 终端矩阵水印：[src/client/components/terminal/matrix-watermark.jsx](src/client/components/terminal/matrix-watermark.jsx)
- AI 供应商预设：[src/client/components/ai/ai-presets.js](src/client/components/ai/ai-presets.js)
- 工具栏入口：[src/client/components/tree-list/bookmark-toolbar.jsx](src/client/components/tree-list/bookmark-toolbar.jsx)

## 测试

```bash
npm run lint          # standard 代码风格检查
npm run test-unit-ci  # Node 原生 test runner，无需启动 Electron
```

## 致谢与许可

- 上游项目：[Electerm](https://github.com/electerm/electerm)，作者 [ZHAO Xudong](https://github.com/zxdong262)，MIT License。
- Xshell 密码解密算法参考了开源项目 Xdecrypt / Xpass 的实现思路。
- 本项目同样以 [MIT License](LICENSE) 开源，保留上游版权声明。
