---
name: sync
description: 用 GitHub 私有仓库同步全局 ~/.claude 配置（CLAUDE.md、settings 模板、memory、plans、密钥本机保留）。settings.json 中 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN、GITHUB_PERSONAL_ACCESS_TOKEN、CLOUDFLARE_API_TOKEN 等本地键各机器保留、不入库。跨 Windows/Linux/macOS。当用户要"同步 claude 配置 / 全局配置同步 / claude sync / 新机器导入 claude 配置"时使用。
---

# claude-sync

脚本：`$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs`（node 无依赖，全平台 hook 走 node 不经 bash，规避 Windows 路径变量反斜杠剥离问题）。

同步模型：dotclaude 私有仓库是「意图」权威源，各机器是「消费方」。
- `settings.template.json` 入库（密钥剔除）
- `settings.json` = template + 本机密钥（渲染产物，被 gitignore）
- `_localOnly` 数组（template 顶层）声明不入库的点路径键

**单向模型**：本机自动化只 `pull`（只读 fetch + 渲染，不回流不 commit），
改动共享始终手动 `push`。这消除了跨机 rebase/冲突的自动触发源。

**范围外**：`~/.claude.json`（全局 MCP 服务器、项目列表等 HOME 根下文件）不归本插件管，跨机需另行处理。

## 首次初始化（当前机器）

**必须先向用户展示影响范围并等确认，再执行 init**——用户可能不清楚哪些内容会被推上 GitHub：

- 将入库：CLAUDE.md、settings 模板（密钥剔除）、plans/、memory、install-plugins.sh 等
- 永不入库：`.credentials.json`、`settings.json` 中 `_localOnly` 密钥键、`projects/`（会话转录）、缓存与运行状态
- 远端是**私有** GitHub 仓库，仓库内容 ≈ 当前 `.claude` 配置快照

确认后：

1. `node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" init`
2. 若尚无远端仓库：`gh repo create dotclaude --private`，然后
   `git -C ~/.claude remote add origin https://github.com/<user>/dotclaude.git`
3. `node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" push`（首次推送）

## 自动化时机

- **拉取**：SessionStart hook 自动跑 `pull`（只读 fetch + 渲染 settings），24h 限频（`.sync-last-pull`）；
  失败静默不打断会话。
- **推送**：始终手动——用户说"同步配置"或本机改了想共享的配置时执行 `push`。
  `push` 会回流本机 settings → template → commit → rebase 远端 → push。不要自动 push（半成品、多机冲突风险）。

## 新机器导入

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" adopt https://github.com/<user>/dotclaude.git
node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" pull   # 渲染本机 settings
bash install-plugins.sh                                        # 声明式装插件（市场/插件重装）
```

远端为准，settings.json 密钥值与 .credentials.json 永不被覆盖（渲染时从本机 settings 回填）。
若新机 settings.json 尚无密钥，提示用户补填 `env` 里的本地键。

## 配置改动的正确姿势

**直接改 `~/.claude/settings.json`**（或 /config），然后手动 `push` 共享。不要手改 template
（除 `_localOnly` 外，template 是 push 时的回流产物，本机 settings 是源）。

**密钥/机器相关键**（`_localOnly` 列出）不入库：BASE_URL、AUTH_TOKEN、GITHUB/CF token 等。
渲染时用本机 settings.json 回填,各机持有自己的值。

## 故障处理

- **template 冲突**（手动 push 时 rebase 停止）：编辑 `~/.claude/settings.template.json` 解冲突，
  并把对方改动中的设置键补进本机 `settings.json`（本机 settings 是回流源）→
  `git -C ~/.claude rebase --continue` → 重跑 push。
- **push 失败**：检查远端 repo 存在、token 有写权限。
- **不想同步某个键**：改 template 顶层 `_localOnly` 数组（点路径，如 `env.FOO`），渲染后该键本地保留。
- **Windows 侧 path**：hook 走 node 不经 bash，`$CLAUDE_PLUGIN_ROOT` 反斜杠由 node 正确处理。

## 卸载行为

卸载插件只移除 skill 与 hook（自动拉取随之停止）；`~/.claude` 内的 `.git`、`.gitignore`、
`settings.template.json` 及远端仓库**原样保留**。彻底清除：删 `~/.claude/.git` 与远端仓库。