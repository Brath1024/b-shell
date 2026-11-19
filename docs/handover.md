# b-shell 交接文档（2026-11-19）

这份文档记录 **本次交付做到哪一步、证据在哪、下一个人从哪继续**。
日常开发规范、目录地图、命令速查在 [AGENTS.md](../AGENTS.md)，Xshell 字段映射在 [xshell-import.md](xshell-import.md)，这里不重复。

---

## 0. 一句话现状

基于 Electerm 5.11.8 的 b-shell 已完成 **Xshell 一键导入**（会话 / 分组 / 密码 / 私钥 / `.xts` 备份），在真实备份（26 个会话）上端到端验证通过，Windows 安装包 **5.11.8-bshell.1** 已构建、校验并发布到 Gitee 发行版（因单文件 100 MB 限制，资产为免安装 `.7z` 与分卷安装包）。

| 项目 | 值 |
| --- | --- |
| 仓库 | `git@gitee.com:Guoqing-Li/b-shell.git`，分支 `main` |
| 本地路径 | `D:\DeskStop\BrathInfo\brath-shell\b-shell` |
| 版本 | `5.11.8-bshell.1` |
| Tag | `v5.11.8-bshell.1` |
| 发行版 | <https://gitee.com/Guoqing-Li/b-shell/releases/tag/v5.11.8-bshell.1> |
| 功能提交 | `bcd0909 feat(xshell): import Xshell .xts backups, session passwords and user keys` |
| 发版提交 | `bfcaa5f chore(release): prepare b-shell 5.11.8-bshell.1 windows build` |
| 构建环境 | Windows 10 19045 / Node v24.9.0 / npm 11.6.0 / electron-builder 26.15.7 / Electron 44.7.0 |

---

## 1. 本次交付内容

### 代码

| 文件 | 作用 |
| --- | --- |
| `src/app/lib/xshell-import.js` | 主进程导入核心：目录发现、`.xsh` 解码、密码解密、NSSSH 私钥转换、书签组装 |
| `src/app/lib/zip-read.js` | `.xts` / `.zip` 读取（条目名为 GBK 时回落解码，含路径穿越防护） |
| `src/app/lib/ipc.js` | 把 `loadXshellSessions` 注册进 `asyncGlobals` 白名单（漏了打包后静默失败） |
| `src/client/store/bookmark.js` | `loadXshellSessions` / `importXshellSessions`：去重、剥离元数据、分组回填、`fixBookmarkGroups()` |
| `src/client/components/xshell-import/` | 导入向导（自动扫描 / 选目录 / 选备份文件，自带中英文 `DICT`） |
| `src/test/unit-ci/xshell-import.spec.js` | 11 个用例：解码、INI、密码、私钥、会话树、`.xts`、zip 安全 |

### 构建与发布配置

- `src/build/electron-builder.json`：Windows 目标从 `tar.gz/appx/nsis` 收敛为 **`nsis/tar.gz`**（放弃未验证的 appx），并加 `"npmRebuild": false`、`"buildDependenciesFromSource": false`，避免打包时重编原生模块。
- `package.json` / `package-lock.json`：版本 `5.11.8-bshell.1`。
- `README.md`：下载表改为实际产物名，删掉 MSIX 表述。
- tag `v5.11.8-bshell.1` 与 `main` 已推送；Gitee 发行版 id `1328508` 已创建并上传资产。

### 产物（`dist/`）

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `b-shell-5.11.8-bshell.1-win-x64-installer.exe` | 118,981,867 B | `3E31DEA8963D7A06445D002A80E718BCCAD93A1361BB84D3880F0D9586625F61` |
| `b-shell-5.11.8-bshell.1-win-x64.tar.gz` | 150,652,874 B | `5EA0B2DE8FB509BAD10D9A24F452DCD1A501096EEB2B053A1946272FE2E965BD` |
| `b-shell-5.11.8-bshell.1-win-x64.7z` | 104,120,853 B | `09CBFBAEAA7B1E216D1F729DDA3D2C44A9B4EA6E7DC8D6FF3FE827CF20976D1E` |
| `…installer.exe.7z.001` | 99,614,720 B | `848C3E3D690A6BB06DDCE592A9EE05A8E4D711DB1D29D3CFE372ACCA2BFEF802` |
| `…installer.exe.7z.002` | 20,380,934 B | `15BF34419AEC410E3176E9F3FFF26A263A27848F423AF52F4A4FA763DD675F59` |
| `b-shell-5.11.8-bshell.1-win-x64-installer.exe.blockmap` | 125,022 B | — |

**Gitee 单文件上限 100 MB**，所以 119 MB 的 installer 与 151 MB 的 tar.gz 不能直接当发行版资产。发行版里放的是：

- 免安装包 `…-win-x64.7z`（99.3 MiB，`7z a -t7z -mx=9` 压 `dist/win-unpacked`），解压即用；
- 安装包分卷 `…-installer.exe.7z.001` + `.002`（`7z a -v95m`），对 `.001` 解压即得原 installer（`7z t .001` 校验 CRC 通过）。
- 原始 installer / tar.gz 仍保留在本机 `dist/`，需要时可改传到其他存储或提供源码构建。

---

## 2. 验证证据（可复现）

### 2.1 导入真实备份

```powershell
node D:\DeskStop\BrathInfo\brath-shell\_tools\test-xshell-import.js D:\DeskStop\xbackup20261119.xts
```

结果：`sessions 26 / imported 26 / ssh 26 / withPassword 22 / lockedPassword 0 / withKey 1 / unsupported 0`，`identity.username=2718`、`canDecrypt=true`，分组 4 个（`Xshell`、`brath`、`brath\dmeet`、`vtest`），`archiveVersion=6.0`。

### 2.2 凭据真的能登录（关键证据）

```powershell
node D:\DeskStop\BrathInfo\brath-shell\_tools\e2e-xts.js D:\DeskStop\xbackup20261119.xts
```

脚本会起一个**只接受备份内凭据**的本地 `@electerm/ssh2` 服务，再用导入出的书签握手：

```text
password => b-shell-e2e-ok
privateKey => b-shell-e2e-ok
wrong-password => rejected (All configured authentication methods failed)
E2E PASS
```

### 2.3 单测与风格

```powershell
node --test src/test/unit-ci/xshell-import.spec.js   # 11/11 pass
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run lint   # standard 无输出
```

### 2.4 安装包本体

- `dist/win-unpacked/b-shell.exe` 文件版本 `5.11.8-bshell.1`，产品名 `b-shell`。
- `resources/app.asar` 内 `package.json` 版本 `5.11.8-bshell.1`，2584 个条目，包含 `xshell-import`。
- 冒烟启动（隔离配置目录）：`b-shell.exe --user-data-dir=%TEMP%\bshell-smoke` 启动后窗口标题 `b-shell - 新连接`，渲染出本地 PowerShell 会话 `PS C:\Users\2718>`，子进程 4 个，无崩溃。

### 2.5 下载回来的发行版资产真的能用

不要只信“本地构建成功”，发布后再验证一次下载件：

```powershell
# 1. 下载 → 比对 SHA256（与 1 节表格一致）
Invoke-WebRequest -Uri 'https://gitee.com/Guoqing-Li/b-shell/releases/download/v5.11.8-bshell.1/b-shell-5.11.8-bshell.1-win-x64.7z' -OutFile downloaded.7z
(Get-FileHash downloaded.7z -Algorithm SHA256).Hash

# 2. 解压 → 启动（注意先 Remove-Item Env:ELECTRON_RUN_AS_NODE）
D:\software\7-Zip\7z.exe x downloaded.7z -oapp -y
Start-Process app\b-shell.exe --user-data-dir=%TEMP%\bshell-smoke-6

# 3. 用打包后的 app.asar 再解析一次备份，确认发布件里的导入逻辑没有过期
$env:ELECTRON_RUN_AS_NODE='1'
app\b-shell.exe <脚本>   # require('<…>/resources/app.asar/lib/xshell-import.js').loadXshellSessions({ root: 'D:\\DeskStop\\xbackup20261119.xts' })
```

实测结果：下载件 SHA256 与本地一致（`09CBFB…76D1E`），解压后窗口标题 `b-shell - 新连接`、本地终端可用；**打包后的 asar 解析同一份备份仍是 26 会话 / 22 密码 / 1 私钥 / 0 锁定 / 4 分组**，与源码运行结果完全一致。

> 注意：在本机 DSH 里做这个冒烟测试要先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`，否则 `b-shell.exe` 会以 Node 模式运行并报 `bad option: --user-data-dir`。

---

## 3. 构建与发布怎么再做一次

### 3.1 出包

```powershell
$npm = 'node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js'
node D:\software\nvmbin\nodejs\node_modules\npm\bin\npm-cli.js run dist:win
```

单次耗时参考（本机）：编译 ~7s，`prepare` ~118s（含 `work/app` 重新 `npm i --omit=dev` 装 174 个包与 `yarn autoclean`），electron-builder 打包 + tar.gz + nsis ~5.5min，合计约 8 分钟。

**两个坑**：

1. 在 PowerShell 里跑时 electron-builder 的 `DeprecationWarning` 写到 stderr，会让任务以 exit code 1 结束——但产物是完整的。判断成功以 `dist/` 产物 + 文件版本为准，不要只看退出码。
2. `dist/` 会保留旧版本产物（本次还有 `b-shell-5.11.8-*`）。上传发行版前先确认文件名带新版本号，或清空 `dist/` 再构建。

### 3.2 打 tag 并推送

```powershell
git tag -a v5.11.8-bshell.1 -m "b-shell 5.11.8-bshell.1"
git push origin main v5.11.8-bshell.1     # 一次推送两个 ref，pre-push 只会跑一次 lint
```

### 3.3 创建 Gitee 发行版

Token 在 Git Credential Manager 里（`git credential fill` 取 32 位 token，**不要打印或提交**）。Gitee API v5：

```powershell
# 1. 创建发行版（tag 已存在时直接关联）
$body = @{ access_token=$token; tag_name='v5.11.8-bshell.1'; target_commitish='main';
           name='b-shell 5.11.8-bshell.1'; body=$releaseBody; prerelease='false' }
Invoke-RestMethod -Uri 'https://gitee.com/api/v5/repos/Guoqing-Li/b-shell/releases' -Method Post -Body $body

# 2. 上传资产（multipart，token 必须放 query string）
#    POST https://gitee.com/api/v5/repos/Guoqing-Li/b-shell/releases/{id}/attach_files?access_token=...
#    表单字段名：file
```

两个细节都踩过：

- `access_token` 放在 multipart 表单里会返回 `401 {"message":"登录失效","code":40001}`，**必须放 query string**。
- **单文件上限 100 MB（104,857,600 B）**：installer 119 MB / tar.gz 151 MB 都被 `400 验证失败：文件大小已超出限制：100 MB` 拒绝。解决：用 7-Zip 压成 `.7z` 或 `-v95m` 分卷，每个资产都控制在这个值以下（99.3 MiB 实测可传）。
- 修改发行版说明用 `PATCH /releases/{id}`，但 **`tag_name` 是必填**，否则报 `{"messages":["tag_name is missing"]}`；改完用 `GET /releases/{id}` 复核 `body` 长度与 `assets` 列表。
- 附件下载地址形如 `https://gitee.com/Guoqing-Li/b-shell/releases/download/<tag>/<filename>`。
- 复用的上传脚本：`%TEMP%\gitee-upload.ps1`（不提交）。本机 PowerShell 执行策略禁止直接跑 `.ps1`，要用 `powershell -NoProfile -ExecutionPolicy Bypass -File ...`；`-Paths a,b` 传多个路径会被拼成一个字符串报 `The given path's format is not supported`，**一次只传一个文件**。

---

## 4. 关键实现约束（改代码前必读）

1. `.xsh` 解码顺序：BOM → UTF-8 严格 → GBK 回落；`.xts` 条目名没有 UTF-8 标志位，中文名是 GBK。
2. 密码 = `Base64(RC4(明文‖SHA256(明文)))`，RC4 key 是 `SHA256(SID字符串)`，SID 候选 `反转(SID)+用户名` 与 `用户名+SID`。**必须校验尾部 32 字节**，失败标 `locked`，别把错误密码写进书签。
3. NSSSH 私钥：`---- BEGIN NSSSH PRIVATE KEY ----`（4 个短横线），kdf 字段要从 `rest`（载荷区）读，不能读整个 buffer——这个 bug 曾导致密钥“导入成功但登录失败”。
4. 书签 id 由会话相对路径哈希生成（`xshell-b-<hash>`），所以重复导入天然去重；分组 id `xshell-g-<hash>`，根组 `xshell-g-root`。
5. 元数据字段（`passwordStatus`、`xshellPath`、`xshellUserKey` …，见 `XSHELL_META_FIELDS`）只在渲染层用，落库前必须剥离。
6. 新增主进程能力必须同步注册到 `src/app/lib/ipc.js` 的 `asyncGlobals`，否则开发模式正常、打包后静默失败。

---

## 5. 已知限制（本次未做）

1. `.xts` 解压目录在 `%TEMP%\b-shell-xshell-<hash>`，**不自动清理**。
2. 不支持 Xshell 的端口转发、登录脚本、快捷命令集、配色/字体（会写进会话 `description`）。
3. Xshell 5 及更早密码、设置了口令的 `.pri`、`ssh-rsa` NSSSH 载荷只导入元信息。
4. 自动更新刻意关闭（`disableUpgradeCheck: true`）。
5. 只验证了 Windows 出包；macOS 的 `icons.icns` 已就绪但没在真机跑 `dist:mac`。
6. 安装包 exe 的 `CompanyName` 仍是上游 `ZHAO Xudong`（来自 `package.json` 的 `author`），要改需调整 `author`/`win.legalTrademarks` 后重新出包。

---

## 6. 建议的下一步（按优先级）

1. **启动时清理** `%TEMP%\b-shell-xshell-*`，顺手把解压目录改成用后即删。
2. 导入向导里对 `locked`（需重录密码）会话做显式提示与批量补录入口。
3. 补 macOS / Linux 出包验证，`dist:mac` / `dist:linux` 目前没有实机记录。
4. 若要恢复自动更新：`baseUpdateCheckUrls` 指向 Gitee 发行版下载地址，并打开 `disableUpgradeCheck`。
5. 把 `author` / `CompanyName` 改成 Brath，统一安装包元数据。
