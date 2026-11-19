# AGENTS.md — 接手 b-shell 二次开发前请先读这篇

本文件写给 AI agent（也写给人类开发者）：读完可以直接开始改代码、跑测试、出包。
用户可见的说明在 [README.md](README.md)，Xshell 迁移细节在 [docs/xshell-import.md](docs/xshell-import.md)，
**本次交付做到哪一步、证据与遗留项**在 [docs/handover.md](docs/handover.md)（接手先看那一篇，再看本篇的规范）。

---

## 1. 这个项目是什么

- **b-shell** 是基于 [Electerm](https://github.com/electerm/electerm) **5.11.8** 源码的 Windows / macOS 终端管理工具，品牌、协议、数据目录、可执行文件名都已改为 b-shell。
- 仓库：`git@gitee.com:Guoqing-Li/b-shell.git`（分支 `main`），本地路径 `D:\DeskStop\BrathInfo\brath-shell\b-shell`。
- 上游源码快照在 `D:\DeskStop\BrathInfo\brath-shell\electerm-master`，只用于对照，**不要在那边改代码**。
- 已经在 Electerm 之上新增的核心能力：**Xshell 一键导入**（会话 + 分组 + 密码 + 私钥，支持 `.xts` 备份）。

技术栈：Electron + React + Vite + Ant Design（渲染进程）、Node.js（主进程）、NeDB / SQLite（本地库）、`@electerm/ssh2`（SSH）、node-pty（终端）。

---

## 2. 命名约定（最容易踩坑的地方）

改名不是简单全局替换，**品牌用 `b-shell`，JS 标识符用 `bshell`**：

| 场景 | 用法 | 例子 |
| --- | --- | --- |
| 产品名、窗口标题、安装包、CLI 命令 | `b-shell` | `b-shell.exe`、`npm i -g b-shell`、`pnpm b-shell` |
| 协议、URL scheme | `b-shell` | `b-shell://`、`b-shell-widget` |
| 用户数据目录、环境变量 | `b-shell` / `BSHELL_` | `%APPDATA%\b-shell`、`BSHELL_CONFIG` |
| appId / identityName | `b-shell` | `com.brath.bshell`、`Brath.b-shell` |
| **JS 全局对象、包内字段、源文件名** | `bshell` | `window.bshell`、`pkg.bshell`、`src/client/entry/bshell.jsx`、产物 `js/bshell-5.11.8.js` |
| manifest 键 | `bshell` | plugin `manifest.bshell` |

**有意保留 `electerm` 字样的地方**（不要“修正”）：`@electerm/*` npm 依赖、`@electerm/electerm-icons`、`@electerm/electerm-sync`、AI 默认端点 `electerm.org`、指向上游的 wiki / issues 链接、`package-lock.json` 里的包名。判断标准：**它是否指向上游真实存在的资源**——指向上游就保留，指向我们自己就该是 b-shell/bshell。

改名遗留检查（应当只输出上面那些保留项）：

```bash
git grep -n -i electerm -- ':!package-lock.json' ':!node_modules'
```

---

## 3. 目录地图

```text
src/app/            Electron 主进程
  lib/              业务模块（ipc、db、menu、ssh-config、xshell-import、zip-read …）
  server/           session / sftp / 终端服务（session-ssh.js 是 SSH 连接的主入口）
  widgets/          内置 widget（含 widget-ssh-server.js：本地 SSH 服务，可用于联调）
src/client/         渲染进程（React）
  components/       UI（xshell-import/ 是导入向导）
  store/            mobx store（bookmark.js 处理书签读写与导入落库）
  common/           schema、常量、i18n 工具
  views/images/     品牌图（bshell*.png/svg）
src/build/          构建脚本（vite-build、copy、pug、prepare、electron-builder.json）
src/build/resources/ 图标资源（icons-win.ico、icons.icns、build-res/…）
src/test/unit-ci/   node --test 单测（xshell-import.spec.js 在这里）
docs/               用户文档（xshell-import.md）
work/               构建中间产物（work/app），不要提交
dist/               electron-builder 输出，不要提交
```

---

## 4. 常用命令（Windows 上请照抄）

```powershell
# npm 必须走真实路径：npm.ps1 会被 PowerShell 执行策略拦截
$npm = 'node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js'

node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js install   # 首次
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run b      # clean + compile + prepare，最常用
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run compile
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js start      # 开发模式
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run dist:win   # 出安装包 → dist/
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run lint
node --test src/test/unit-ci/xshell-import.spec.js
```

- 打包前的 `npm run lint`（standard）必须干净，`.git/hooks/pre-push` 会强制跑它。
- 只改 JSX/JS 想快速验证语法，可用 `_tools/check-jsx.js`（esbuild 单文件校验，见第 9 节）。
- `npm install` 后 `package-lock.json` 常有噪声变更，提交前 `git checkout -- package-lock.json`。

---

## 5. Xshell 一键导入：数据流与关键文件

```text
渲染层 UI            src/client/components/xshell-import/index.jsx
   ↓ mobx store      src/client/store/bookmark.js  loadXshellSessions / importXshellSessions
   ↓ IPC 白名单      src/app/lib/ipc.js            asyncGlobals 里注册 loadXshellSessions
   ↓ 主进程实现      src/app/lib/xshell-import.js  loadXshellSessions(opts)
   ↓ ZIP 支持        src/app/lib/zip-read.js       .xts / .zip 读取与解压
```

**`loadXshellSessions({ root })` 的行为**

- `root` 可以是：Xshell 数据目录、`…\8`、`…\Xshell`、`…\Xshell\Sessions`、`.xts`/`.zip` 备份文件，或不传（自动扫描 5–9 各版本目录与 OneDrive / `%APPDATA%`）。
- `findSessionsRoot()` 会向下探 3 层、按 `.xsh` 数量选最像 Sessions 的目录，保证同一个备份从任何层级进入都得到**同一个**结果，不会多出一个 `Xshell` 组。
- 返回：
  ```js
  { root, roots, source: { type: 'dir'|'archive', file }, error, identity: { username, sid, canDecrypt },
    stats: { sessions, imported, ssh, telnet, other, withPassword, lockedPassword, withKey, unsupported },
    groups: [{ id, title, parentId, path }],
    bookmarks: [ /* 已按 schema 组装的载荷，见下 */ ],
    unsupported: [{ title, protocol }],
    keys: [{ name, type, comment, publicKey }], keyStats: { total, imported, encrypted, unsupported },
    meta: { masterPassword, archiveVersion, lockedPasswords } }
  ```
- 书签里的内部元数据字段（**不写库**，导入后由 store 剥离）：`passwordStatus`、`xshellPath`、`folderPath`、`xshellGroupId`、`xshellUserKey`、`xshellColorScheme`、`xshellFont`。见 `XSHELL_META_FIELDS`。
- id 由会话相对路径哈希生成（`xshell-b-<hash>`），因此**重复导入天然去重**；分组 id 是 `xshell-g-<hash>`，根组固定 `xshell-g-root`。

**必须遵守的格式事实**（都已踩过坑）

1. `.xsh` 是 **UTF-16LE + BOM**（部分环境是 UTF-8 BOM / GBK），解码顺序：BOM → UTF-8 严格 → GBK 回落。
2. `.xts` 是 **普通 ZIP**，条目名 **没有 UTF-8 标志位**，中文名是 **GBK**，读不出来要回落 GBK。
3. Xshell 密码 = `Base64( RC4(SHA256(明文) 附在尾部) )`，RC4 key = `SHA256(SID字符串)`；SID 字符串候选 `反转(SID)+用户名`（Xshell 7/8）与 `用户名+SID`（≤6）。**必须用尾部 32 字节 SHA-256 校验**，通过才算解密成功，否则标 `locked`。
4. 用户密钥 `.pri` 是 NSSSH 容器：`---- BEGIN NSSSH PRIVATE KEY ----`（4 个短横线）、`Comment:`、`Key: n, <type>`，base64 = SSH 公钥 blob + `nsssh-key-v6\0` 私有载荷。私有载荷 = `checkint`×2 + `string(私钥 64 字节 = seed||pub)` + `string(注释)` + 填充；**kdf 字段必须从载荷区（`rest`）读取，不是整个 buffer**（这是曾经导致“密钥不可用”的 bug）。
5. 转 OpenSSH 时必须写标准结构（`openssh-key-v1\0` + cipher/kdf/options + 1 个 pubBlob + 私钥段 + `1,2,3…` 填充到 8 字节倍数），`@electerm/ssh2` 会校验尾部填充序列，`ssh-rsa/ssh-dss` 的 NSSSH 载荷结构不同，直接标 `unsupported` 别硬解。

**渲染层约束**：向导必须走 `window.pre.runGlobalAsync`（IPC 白名单在 `src/app/lib/ipc.js` 的 `asyncGlobals`），新增主进程能力要同步在那里注册，否则打包后静默失败。文案用组件内 `DICT` + `window.getLang()`，仓库里已有 i18n 目录但本功能刻意做成自带双语，避免动多语言文件。

---

## 6. 书签数据模型要点

- schema 在 `src/client/common/bookmark-schemas.js`（zod）。新增字段前先确认 schema 允许，否则会被过滤掉。
- 分组：`bookmarkGroups` 用 `bookmarkIds` / `bookmarkGroupIds` 双向引用；`level` 1 顶层、2 子级。导入后必须调用 `store.fixBookmarkGroups()` 修正引用。
- 私钥可以直接存在书签的 `privateKey` 字段（PEM 文本），也可以存 `privateKeyPath`；密码在 `password`。
- 导入时若 `authType === 'privateKey'` 但拿不到私钥，要回退成 `'password'`，否则连接会直接失败。

---

## 7. 测试与验证

```powershell
node --test src/test/unit-ci/xshell-import.spec.js   # 11 例：解码 / INI / 密码 / 密钥转换 / .xts / zip 安全
node --test src/test/unit-ci/*.spec.js               # 全量，正常 3 分钟内
```

- 全量 `unit-ci` 里有一批 **上游自带的** Windows 失败/挂起（`x11` 监听权限、`system-ca-args` 含空格路径、`install-command` 路径分隔符、需要联网的 `session-ssh*` / `zmodem` …）。判断标准：**在 `electerm-master` 干净副本上同样失败**，就不是我们的回归，别去改。
- 真实链路验证（推荐每次动导入逻辑后跑）：`node _tools/e2e-xts.js <备份.xts>`。它会启动一个只接受备份内凭据的本地 SSH 服务，再用导入出的书签连接，验证密码与私钥**真的能登录**。
- 改 UI 后至少 `npm run b` 通过，并检查 `work/app/assets/images` 里出现 `bshell*.png`。

---

## 8. 发布到 Gitee

当前已发布版本：`v5.11.8-bshell.1`（发行版 id `1328508`，<https://gitee.com/Guoqing-Li/b-shell/releases/tag/v5.11.8-bshell.1>）。
完整复现步骤、耗时与踩坑记录见 [docs/handover.md](docs/handover.md) 第 3 节。

```powershell
# 1. 改版本号（package.json + package-lock.json），同步 README 下载表
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run dist:win
# 产物在 dist/：b-shell-<version>-win-x64-installer.exe / .tar.gz / .blockmap（appx 已移除）
# 2. 打 tag 并一次推送 main + tag（pre-push 只跑一次 lint）
git tag -a v<version> -m "b-shell <version>"
git push origin main v<version>
# 3. Gitee API v5 创建发行版 + 上传资产，见下
```

- Gitee 的「发行版」需要在网页或 API 里创建并上传 `dist/` 里的安装包；仅推 tag 不会自动生成发行版。
- API 创建：`POST https://gitee.com/api/v5/repos/Guoqing-Li/b-shell/releases`，表单 `access_token` / `tag_name` / `target_commitish=main` / `name` / `body`。
- API 上传：`POST .../releases/{id}/attach_files`，multipart 字段名 `file`，**`access_token` 必须放 query string**（放表单里会 401 `登录失效`）。
- Token 在 Git Credential Manager 里（`git credential fill` 可取出 32 位 token），**不要打印、不要提交**。
- `src/build/electron-builder.json` 里每个平台的 `publish` 都请用 `--publish never`（或已移除 provider），**不要**让 electron-builder 往 GitHub 推。
- 版本号在 `package.json`，上游是 5.11.8；发版用 `5.11.8-bshell.<N>` 并在 `README.md` 的下载表里同步。
- 在 PowerShell 里跑 `dist:win` 时 stderr 的 DeprecationWarning 会让任务以 exit code 1 收尾，但产物完整；判断成功以 `dist/` 产物与 `b-shell.exe` 文件版本为准。
- 出包前清空 `dist/`，否则旧版本产物会混在一起，上传时容易传错文件。
- **Gitee 发行版单个资产上限 100 MB**：installer 119 MB / tar.gz 151 MB 会被 400 拒绝。按需压成 `.7z`（`7z a -t7z -mx=9`）或 `-v95m` 分卷后上传；改发行版说明用 `PATCH /releases/{id}`，`tag_name` 必填。

---

## 9. 辅助脚本（仓库外的 `_tools/`，不提交）

`D:\DeskStop\BrathInfo\brath-shell\_tools\` 下有这些一次性工具，改导入功能时很有用：

| 脚本 | 作用 |
| --- | --- |
| `e2e-xts.js` | 端到端：真实备份 → 导入 → 本地 SSH 服务验证密码/私钥 |
| `test-xshell-import.js` | 打印导入统计与前几条书签，快速看有没有解析崩 |
| `parse-pri.js` | 逐字段 dump NSSSH 密钥，排查密钥格式 |
| `check-jsx.js` | esbuild 单文件语法校验（`node check-jsx.js <相对路径…>`） |
| `run-unit-each.mjs` | 逐个 spec 跑单测，用来区分“挂起”是哪个文件 |
| `gen-icons.py` / `wire-icons.mjs` | 品牌图生成与接线（重做图标时才需要） |

---

## 10. 提交约定与常见坑

- 提交身份：`git -c user.name=Brath -c user.email=brath@126.com commit …`。
- HTTPS 远端在这台机器上是坏的，**全部用 SSH**（`git@gitee.com:Guoqing-Li/b-shell.git`）。
- `.git/hooks/pre-push` 由 `postinstall` 安装，会跑 `npm run lint`；hook 里用 `git rev-parse --show-toplevel` 定位仓库根（早期版本上跳三级会跑到父目录，直接卡死推送）。
- `standard` 无分号、2 空格缩进；JSX 用单引号；不要引入新依赖除非必要（导入功能刻意做到零新依赖：ZIP 用 zlib，密钥转换用 Node crypto）。
- Windows 上写文件注意 BOM 与编码：用 `[IO.File]::WriteAllText(path, text, UTF8Encoding($false))`，别写出 BOM。
- `git status` 里出现 `work/`、`dist/` 属正常（已 ignore）。

---

## 11. 已知限制 / 后续可做

1. `.xts` 解压目录在 `%TEMP%\b-shell-xshell-<hash>`，目前**不自动清理**（可加启动时清理）。
2. 不支持 Xshell 的端口转发、登录脚本、快捷命令集（`QuickCommandSet`）、配色/字体；导入时在 `description` 里说明。
3. Xshell 5 及更早的密码算法、设置了口令的 `.pri`、`ssh-rsa` NSSSH 载荷都只能导入元信息，需用户补一次凭据。
4. 自动更新已刻意关闭（`disableUpgradeCheck: true`），要恢复需同时补 `baseUpdateCheckUrls` 的发布源。
5. 目前只验证 Windows 出包；macOS 的 `icons.icns` 已生成，但未在真机跑 `dist:mac`。
