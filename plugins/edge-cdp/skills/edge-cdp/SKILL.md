---
name: edge-cdp
description: |
  WSL/Linux 侧通过 CDP 调试 Windows 侧 Edge。当用户需要：启动一个完全干净的 Edge CDP 实例（不携带日常 profile 的登录态/插件/历史）、复用已登录的实例、取某个页面的 HTML/文本/截图、查/清微软残留 cookie 等场景时使用。
  Also when the user wants to: drive Microsoft Edge remotely (WSL host, Windows guest), launch msedge with --remote-debugging-port, the "two Edge" trap (single-instance swallowing flags), or clean the msn/bing sign-in cookies that leak a logged-in Windows account into a fresh profile.
  触发词：edge cdp、msedge --remote-debugging-port、Windows 侧 Edge 调试、edge-clean、干净实例、launch Edge CDP。
  不适用：纯用户日常用浏览器查看消息（无 CDP）、Chrome/Chromium（非 Edge）的场景。
---

# Edge CDP 调试（WSL → Windows msedge）

场景：宿主是 WSL/Linux，被控的是 **Windows 侧的 Microsoft Edge**（`msedge.exe`），通过 Chrome DevTools Protocol（`--remote-debugging-port`+HTTP/WebSocket）司机它。所有脚本都在 WSL 侧跑，靠 `/mnt/c/...` 路径 + Windows 工具（`taskkill`/`tasklist`）控制。

## 目录结构

```
skills/edge-cdp/scripts/
  launch_clean_edge.sh   # 起干净实例（杀旧 Edge + 全新 profile + 等端口）
  clear_ms_cookies.mjs   # 清微软残留 cookie（.msn.com/.bing.com）
  dump_page.mjs          # 取页面 HTML/文本/截图
```

## 核心工作流

### 1. 起干净实例

WSL 里运行：

```bash
# 最简单：默认端口 9322
bash <skill目录>/scripts/launch_clean_edge.sh

# 自定义端口/要清微软 cookie
bash <skill目录>/scripts/launch_clean_edge.sh --port 9400 --clear-cookies
```

脚本内部做了四件事（**这四步缺一不可**）：

1. `taskkill /F /IM msedge.exe` 杀干净旧 Edge — 关键，**不杀干净=白干**（单例会吞参数）
2. `rm -rf` + 重建独立 `--user-data-dir`（默认 `/mnt/c/temp/edge-cdp-clean`）
3. 带 `--remote-debugging-port=9322` 起 msedge
4. 轮询等 CDP 端口就绪，输出 `webSocketDebuggerUrl`

启动后连它的 URL 就是输出里的 `http://127.0.0.1:9322`。

### 2. 取页面内容

```bash
node <skill目录>/scripts/dump_page.mjs 9322 --url https://example.com --text
# --text 默认（innerText） | --html（outerHTML）| --screenshot /tmp/shot.png
# --eval 'document.title' 任意表达式
# --new 新开页面（默认复用 about:blank 页避免 tab 堆积）
```

### 3. 清微软残留 cookie（可选，参考）

```bash
node <skill目录>/scripts/clear_ms_cookies.mjs 9322
```

不推荐默认跑（见「微软残留」节）。

## 关键坑（必须理解，否则无限踩）

### 坑 1：Edge 单例会吞掉新参数

只要「默认 profile 的 Edge 已在跑」，你再敲 `msedge.exe --user-data-dir=新目录 --remote-debugging-port=9322`，**新参数全被忽略**、命令被路由进已有实例。表现为：改目录没用、永远带着日常登录态。**解决：启动前先 `taskkill /F /IM msedge.exe` 等进程彻底消失再起**（脚本已内置轮询等待）。

### 坑 2：微软账户 cookie 会「种」进全新 profile（实测）

即使 `rm -rf` 掉整个 profile、用全新 `--user-data-dir` 重新起，Edge 依然会给新实例注入一组 `.msn.com`（`elt`=access_token、`lt`、`eltc`）和 `.bing.com`（`_EDGE_S`=SID、`MUID`）的登录 cookie。原因是 Edge 的**账户层 + 首次运行组件**在启动时对微软账号站种 cookie，存在「profile 之外」的账户层。`--user-data-dir` 换目录挡不住。

**实测**：`--disable-features=msEdgeMSAStandaloneSignin`、`--disable-sync`、`--edge-redirect-feed...` 等 flag **全部挡不住**，每次新起 cookie 值还会变（新 SID）。

**真正能清掉的唯一方式**：实例起来后，在 CDP 内 `Network.deleteCookies` + `Storage.clearCookies`（见 `clear_ms_cookies.mjs`），实测删到 0。

**结论**：残留的微软 cookie **不影响自动化使用**（脚本拿它们当噪声即可）；如确需清零，起完实例后跑 `clear_ms_cookies.mjs`。**每次启动都会重新种**，所以"清一次"只在本次会话有效，下次全新实例又会带。

### 坑 3：`--user-data-dir` 路径格式

WSL 传 Windows 进程的参数要用 **Windows 路径**（`C:\temp\edge-cdp-clean`），不是 `/mnt/c/temp/...`。脚本里用 `wslpath -w` 自动转（第 26 行）。手动跑时别搞混。

## 红线

- **不要**用新参数试图绕过同一个老 Edge 实例 — 必须先杀掉再起，参数才有意义。
- **不要**让普通用户日常使用建议「每次换目录」— 那解决不了单例问题。
- 微软残留 cookie 不是 bug，是 Edge 行为；**默认流程不处理它**，仅在用户确需时加 `--clear-cookies`。

## 常见错误排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 端口一直连不上 / CDP 没响应 | 单例吞参数 / 启动失败 | 手动确认能起；确认 `taskkill` 后进程真没了 |
| cookie 总带微软登录态 | Edge 账户层注入（非 bug） | 接受它；如需清零用 `--clear-cookies` |
| WSL 路径报错找不到 exe | 传错路径格式 | 确认是 `C:\...` 而非 `/mnt/c/...` |