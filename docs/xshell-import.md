# 把 Xshell 数据导入 b-shell / Electerm

b-shell 是 [Electerm](https://github.com/electerm/electerm) 的二次开发版本，书签、分组、快速命令等数据格式与 Electerm 完全一致。本文档分两部分：

- **b-shell 一键导入（推荐）**：自动扫描 Xshell 会话文件，连密码和目录结构一起导入。
- **手动 / 通用导入**：适用于原生 Electerm，或只想导入部分会话的场景。

---

## 一、先理解两边的数据长什么样

| | Xshell | b-shell（Electerm） |
| --- | --- | --- |
| 存储位置 | `文档\NetSarang Computer\<版本>\Xshell\Sessions\` | 用户数据目录下 `b-shell` 文件夹（SQLite / NeDB） |
| 一条会话 | 一个 `.xsh` 文件（INI 文本） | 一条 `bookmarks` 记录（JSON 对象） |
| 分组 | 文件夹 | `bookmarkGroups`（`bookmarkIds` / `bookmarkGroupIds` 引用） |
| 密码 | `[CONNECTION:AUTHENTICATION] Password=`，RC4 + SHA-256 校验的 Base64 密文 | `password` 明文，写入本地数据目录，本地加密存储 |
| 终端类型 | `[TERMINAL] Type=xterm` | `term`（默认 `xterm-256color`） |
| 编码 | `[TERMINAL] CodePage=65001` | `encode`（`utf8`、`gbk` …） |

`.xsh` 文件是 **UTF-16LE / UTF-8 带 BOM** 的 INI 文本，可以直接用记事本打开查看内容，但**不要手工修改密码字段**，密文一改就作废。

---

## 二、b-shell 一键导入 Xshell 会话

### 2.1 打开入口

在左侧书签面板的工具栏上，点击 **Windows 图标按钮**（提示文字为「从 Xshell 导入」），也可以在工具栏右侧的 `…` 菜单里选择「从 Xshell 导入」。

### 2.2 自动扫描的位置

打开对话框后 b-shell 会自动扫描以下目录（按 Xshell 5 - 9 的默认安装位置）：

```text
%USERPROFILE%\Documents\NetSarang Computer\9\Xshell\Sessions
%USERPROFILE%\Documents\NetSarang Computer\8\Xshell\Sessions
...
%USERPROFILE%\Documents\NetSarang Computer\5\Xshell\Sessions
%OneDrive%\Documents\NetSarang Computer\<版本>\Xshell\Sessions
%APPDATA%\NetSarang\Xshell\Sessions
```

如果扫描不到（例如把「文档」目录重定向到了其他盘），把 `Sessions` 目录完整路径填进对话框顶部的输入框，点击「重新扫描」即可。也可以设置环境变量：

```bat
set XSHELL_SESSION_PATH=D:\MyData\NetSarang Computer\8\Xshell\Sessions
```

多个目录用分号 `;` 分隔。

### 2.3 字段映射关系

| Xshell（`.xsh`） | b-shell 书签字段 | 说明 |
| --- | --- | --- |
| 会话文件名 | `title` | `192.168.10.218.xsh` → `192.168.10.218` |
| `[CONNECTION] Host` | `host` | |
| `[CONNECTION] Port` | `port` | 缺省按协议取 22 / 23 / 3389 / 5900 |
| `[CONNECTION] Protocol` | `type` | `SSH` / `TELNET` / `RDP` / `VNC` 映射为对应类型 |
| `[CONNECTION] Description` | `description` | 追加 Xshell 密钥名和导入来源路径 |
| `[CONNECTION:AUTHENTICATION] UserName` | `username` | |
| `[CONNECTION:AUTHENTICATION] Password` | `password` | 本地解密后导入，见 2.4 |
| `[CONNECTION:AUTHENTICATION] UserKey` | 备注 + `authType` | 密钥文件本身不会复制，导入后请手动指定私钥路径 |
| `[CONNECTION:AUTHENTICATION] UseAuthAgent` | `useSshAgent` | `1` → 使用 SSH Agent |
| `[CONNECTION:SSH] ForwardX11` | `x11` | `1` → 开启 X11 转发 |
| `[CONNECTION:SSH] AgentForwarding` | `agentForward` | `1` → 开启 Agent 转发 |
| `[CONNECTION:SSH] InitRemoteDirectory` | `startDirectory` | sftp 初始目录 |
| `[CONNECTION:FTP] Passive` | `enableSftp` | |
| `[TERMINAL] Type` | `term` | `xterm` 统一升级为 `xterm-256color` |
| `[TERMINAL] CodePage` | `encode` | `65001`→`utf8`、`936`→`gbk`、`950`→`big5` … |
| `[CONNECTION:AUTHENTICATION] TelnetLoginPrompt` / `TelnetPasswordPrompt` | `loginPrompt` / `passwordPrompt` | 仅 Telnet |
| `Sessions` 下的文件夹层级 | 书签分组 | 顶层建一个「Xshell」分组，子文件夹原样还原 |

**不会导入的内容**（b-shell 中没有对应概念，需要手动处理）：端口转发/隧道、登录脚本（`UseInitScript` / `ScriptPath`）、`QuickCommandSet` 快捷命令、日志路径、Xshell 配色/字体（b-shell 的字体与主题是全局设置）、代理服务器。

### 2.4 密码是怎么解密出来的

- 密文结构：`Base64( RC4 密文 + SHA256(明文密码) )`。
- RC4 密钥：`SHA256( SID字符串 )`，其中 SID 字符串为：
  - Xshell 7 / 8：`反转(Windows SID) + 用户名`
  - Xshell 6 及更早：`用户名 + Windows SID`
- b-shell 用 `whoami /user` 取当前 Windows SID，两种拼接顺序都试一遍，并用末尾 32 字节的 SHA-256 校验值验证，校验通过才写入，**不会导入乱码密码**。
- 因此，只有 **用当前 Windows 账户、且没有设置 Xshell 主密码（Master Password）** 加密的会话才能被解密。

无法解密的会话会显示橙色的「需重录密码」标签。这类会话 **主机、端口、用户名、分组照常导入**，第一次连接时在 b-shell 里输入一次密码即可（勾选「记住密码」）。常见原因：

1. Xshell 设置了主密码；
2. 会话是在其他 Windows 账户/其他电脑上保存的；
3. 会话来自 Xshell 5 或更早版本（加密算法不同）。

### 2.5 重复导入 / 增量导入

会话 ID 由 **文件相对路径** 生成，是稳定的。因此可以随时再点一次「一键导入」：

- 已导入过的会话自动跳过；
- Xshell 里新增的会话会被补进来；
- b-shell 里手动改过的书签不会被覆盖。

### 2.6 导入后建议做的 3 件事

1. **检查分组**：新导入的会话都挂在「Xshell」分组下，可以拖动整理、改名、加颜色。
2. **首次连接确认主机指纹**：b-shell 会像 Xshell 一样弹出主机指纹确认。
3. **补齐密码**：看到「需重录密码」的会话，连接一次并保存密码。

---

## 三、手动 / 通用导入方式（原生 Electerm 同样适用）

### 3.1 导入书签 JSON（可批量、可做分组）

书签面板工具栏 → 上传图标（导入书签）→ 选择 JSON 文件。支持三种格式：

1. 书签数组：`[{...}, {...}]`
2. 完整对象：`{ "bookmarks": [...], "bookmarkGroups": [...] }`
3. 单个书签对象：`{...}`

最小可用示例（两条会话 + 一个分组）：

```json
{
  "bookmarkGroups": [
    {
      "id": "group-xshell",
      "title": "Xshell 导入",
      "bookmarkIds": ["bm-1", "bm-2"],
      "bookmarkGroupIds": []
    }
  ],
  "bookmarks": [
    {
      "id": "bm-1",
      "title": "生产服务器",
      "host": "192.168.10.218",
      "port": 22,
      "username": "root",
      "password": "在这里填密码",
      "type": "ssh",
      "term": "xterm-256color",
      "color": "#0088cc",
      "description": "从 Xshell 导出"
    },
    {
      "id": "bm-2",
      "title": "测试机",
      "host": "192.168.111.20",
      "port": 22,
      "username": "root",
      "type": "ssh"
    }
  ]
}
```

注意事项：

- `bookmarkGroups[].bookmarkIds` 必须引用书签的 `id`，否则分组是空的；
- 没有分组归属的书签会自动收进「未分类」分组；
- 密码是明文，导出的 JSON 文件本身**没有加密**，注意文件安全；
- 从 b-shell/Electerm 导出的书签可以直接再导入，格式自洽。

### 3.2 导入 `~/.ssh/config`

b-shell 启动时会读取 `~/.ssh/config`（Windows 为 `%USERPROFILE%\.ssh\config`），把 `Host` 条目列为「ssh configs」分组导入书签，不需要手工操作。也可以在工具栏 `…` 菜单里手动触发「加载 ssh config」。

Xshell 的会话不会写进 `~/.ssh/config`，所以这种方式只适合本来就有 ssh config 的用户。

### 3.3 快速连接（适合零散会话）

在 b-shell 的快速连接框输入 URI 回车即可建立会话并保存为书签：

```text
ssh://root@192.168.10.218:22
telnet://admin@10.0.0.1:23
```

### 3.4 手工新建书签

书签面板 → 「+」新建书签 → 填入 Xshell 会话里 `[CONNECTION]` 的 Host / Port、`[CONNECTION:AUTHENTICATION]` 的 UserName，密码手动输入。适合只需要迁移少量会话、或无法解密密码的情况。

---

## 四、批量转换脚本（可选）

如果需要在没有 b-shell 的机器上先做一次转换，可以直接复用 b-shell 的导入模块（Node.js ≥ 16）：

```js
// dump-xshell.js
const { loadXshellSessions } = require('./src/app/lib/xshell-import')
const fs = require('fs')

const data = loadXshellSessions({
  root: 'C:\\Users\\you\\Documents\\NetSarang Computer\\8\\Xshell\\Sessions'
})
// 去掉 b-shell 内部使用的元数据字段，得到可直接导入的书签 JSON
const META = ['passwordStatus', 'xshellPath', 'folderPath', 'xshellGroupId', 'xshellColorScheme', 'xshellFont']
const bookmarks = data.bookmarks.map(b => {
  const item = { ...b }
  META.forEach(k => delete item[k])
  return item
})
fs.writeFileSync('xshell-bookmarks.json', JSON.stringify({
  bookmarks,
  bookmarkGroups: data.groups.map(g => ({
    id: g.id,
    title: g.title,
    level: g.parentId ? 2 : 1,
    bookmarkIds: bookmarks.filter(b => b.xshellGroupId === g.id).map(b => b.id),
    bookmarkGroupIds: data.groups.filter(c => c.parentId === g.id).map(c => c.id)
  }))
}, null, 2))
console.log(data.stats)
```

然后把 `xshell-bookmarks.json` 用「导入书签」按钮导入任意 b-shell / Electerm 实例。

---

## 五、常见问题

**Q：扫描不到会话？**
确认 Xshell 中会话确实保存过（不是只开了临时会话），并检查「文档」目录是否被 OneDrive 等重定向；手动填目录后重新扫描即可。

**Q：导入后密码是空的 / 显示「需重录密码」？**
见 2.4：Xshell 主密码、其他 Windows 账户、Xshell 5 及更早版本都会导致无法解密。主机和用户名已经导入，重录一次密码即可。

**Q：会话名中文正常，但终端里中文乱码？**
Xshell 的 `CodePage` 已经映射到 `encode`；如果目标系统实际是 UTF-8 而 Xshell 里是 GBK（或相反），在书签编辑里改「编码」即可（`utf8` / `gbk`）。

**Q：分组是空的？**
一键导入会自动重建文件夹层级；手动导入 JSON 时请检查 `bookmarkIds` 是否引用了正确的书签 `id`。

**Q：重复导入会不会产生重复会话？**
不会。一键导入按会话文件路径去重，已存在的直接跳过。

**Q：端口转发、快捷命令、登录脚本去哪了？**
这些没有对应的 Xshell→b-shell 自动映射，需要手动在书签里重建：端口转发在书签编辑器的「隧道」中配置，快捷命令在「快速命令」面板配置。

**Q：能不能把 b-shell 的会话再导回 Xshell？**
可以导出书签 JSON，再用脚本转换为 `.xsh`；b-shell 不提供 `.xsh` 导出（Xshell 的密码加密算法需要 Windows SID，跨机器不可移植）。
