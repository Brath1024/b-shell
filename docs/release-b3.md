# b-shell 5.11.8-bshell.3

基于 Electerm 5.11.8 的 Windows 终端管理工具，重点解决 **Xshell 配置迁移**：把 `.xts` 备份拖进窗口，会话、分组、密码、私钥一次导入。

## 本版重点：一个文件、不分卷

上一版受 Gitee 单资产 100 MB 限制，把安装包切成了 `.7z.001` / `.002` 两个分卷。这一版把运行时精简到限制以内，发行版只有 **一个文件**：

```
b-shell-5.11.8-bshell.3-win-x64-portable.7z   87.8 MB
```

解压后双击 `b-shell.exe` 即可使用，免安装、不写注册表。

## 下载

| 文件 | 说明 |
| --- | --- |
| `b-shell-5.11.8-bshell.3-win-x64-portable.7z` | Windows x64 免安装版（单文件，87.8 MB） |

SHA256：

```
FDA66E9895455325CE3DCA995858A8015B083BB00DAE2764B74A61A451C32BE9
```

## 体积是怎么降下来的

| 措施 | 省下 |
| --- | --- |
| 7-Zip `-mx=9 -md=256m` 固实压缩 + BCJ（64 位 7-Zip，旧版 32 位分配不出大字典） | ~12 MB |
| 移除 RDP 客户端背景 wasm（`rdp_client_bg-*.wasm`，4.9 MB） | ~4.9 MB |
| 移除 ARM64 预编译模块（`node-pty`、`@serialport`） | ~2 MB |
| 移除 Vulkan / SwiftShader 软件渲染回退（`vk_swiftshader.dll`、`vulkan-1.dll`、`dxcompiler.dll`、`dxil.dll`） | ~6 MB |
| 移除 sourcemap（`*.map`） | ~1.2 MB |

原始 `win-unpacked` 从 351 MB 降到 311 MB，压缩后从 99.0 MB 降到 **87.8 MB**。

> 为什么不是 80 MB 以内：`b-shell.exe` 单文件 235 MB，压缩后 60.8 MB；`resources.pak` 11.86 MB 几乎不可再压缩（压完 11.75 MB）；`icudtl.dat` 3.2 MB、`app.asar` 3.1 MB 都是硬开销。把 GPU 与 ffmpeg 相关 DLL 全删估算也才 84.3 MB，仍高于 80 MB，所以停在 87.8 MB。

## 功能

- **Xshell 一键导入**：`.xts` 备份（含密码与私钥）、`Sessions` 目录；支持拖拽文件/文件夹直接落库；重复导入按会话路径哈希去重
- **三次入口**：首屏引导弹窗、左侧栏的 Xshell 图标、设置里的导入项
- **SSH / SFTP / Telnet / RDP / VNC / 串口**、Zmodem、同步盘、快捷命令、主题
- **终端常驻矩阵水印**（Brath Shell 字标 + 字符雨，透明叠加，不挡操作）
- **AI 助手**：内置 DeepSeek 官方（`deepseek-flash` / `deepseek-v4-pro`）与 OpenCodeGo（12 个模型）预设

## 修复

- 数据库与加密密钥位置不一致导致书签退化成「本地」空壳：数据目录改为跟随 `userData`，解密失败的行明确落日志并从库里剔除，重复导入会把空壳就地修好
- 导入向导在中文环境下显示英文：改为读 `window.store.config.language`

## 数据位置

与安装版一致：`%APPDATA%\b-shell\users\default_user\bshell.db`。
删除该目录即恢复出厂设置；升级只要覆盖程序目录，书签与密码不会丢。

## 已知限制

1. 精简版不含 RDP 客户端背景图与 Vulkan 软件渲染回退，无独立显卡的极老机器上渲染可能走 CPU 回退
2. 只提供 Windows x64 构建；macOS / Linux 需自行编译
3. Xshell 5 及更早版本的密码算法、设了口令的 `.pri` 只能导入元信息
4. 自动更新默认关闭

项目主页：<https://gitee.com/Guoqing-Li/b-shell>
