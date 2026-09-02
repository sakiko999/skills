---
name: sync
description: 用 GitHub 私有仓库同步全局 ~/.claude 配置（CLAUDE.md、settings 模板、memory、plans、插件清单）。settings.json 中 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN 等密钥各机器本地保留、不入库。跨 Windows/Linux/macOS。当用户要"同步 claude 配置 / 全局配置同步 / claude sync / 新机器导入 claude 配置"时使用。
---

# claude-sync

脚本：`$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs`（node 无依赖，全平台可用）。

同步模型：`~/.claude/settings.template.json` 入库作为权威配置（密钥已剔除），
`~/.claude/settings.json` = template + 本机密钥（渲染产物，被 gitignore）。
`_localOnly` 数组（template 顶层）声明不入库的点路径键。

## 首次初始化（当前机器）

**必须先向用户展示影响范围并等确认，再执行 init**——用户可能不清楚哪些内容会被推上 GitHub：

- 将入库：CLAUDE.md、settings 模板（密钥剔除）、memory/、plans/、插件清单、context-recall/
- 永不入库：`.credentials.json`、`settings.json` 中的 `_localOnly` 密钥键、会话转录 projects/、各类缓存与运行状态
- 远端是**私有** GitHub 仓库，仓库内容 ≈ 当前 `.claude` 配置快照

确认后：

1. `node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" init`
2. 若尚无远端仓库：`gh repo create dotclaude --private`，然后
   `git -C ~/.claude remote add origin https://github.com/<user>/dotclaude.git`
3. `node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" sync`（首次推送）

## 自动化时机

- **拉取**：SessionStart hook 自动跑 `pull` 子命令（pull + 渲染），内置 24h 限频（`.sync-last-pull` 戳），每天最多一次；失败静默不打断会话。
- **推送**：始终手动——用户说"同步配置"时执行 `sync`。不要自动 push（半成品状态、多机冲突）。

## 新机器导入

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" adopt https://github.com/<user>/dotclaude.git
```

远端为准覆盖本机（settings.json 的密钥值与 .credentials.json 永不覆盖），随后跑一次 sync 推回。
若新机器 settings.json 尚无密钥，提示用户补填 `env` 里的本地键。

## 配置改动的正确姿势

**改 `~/.claude/settings.json`**（或 /config），sync 会自动双向回流，不要直接手改 template ——
除 `_localOnly` 数组外，template 中其他键的本地手改会被 settings.json 回流覆盖。

## 故障处理

- **template 冲突**（rebase 停止）：编辑 `~/.claude/settings.template.json` 解冲突 →
  `git -C ~/.claude add -A && git -C ~/.claude rebase --continue` → 重跑 sync。
  （仅此场景手改 template 才有意义）
- **push 失败**：检查远端 repo 存在、token 有写权限。
- **不想同步某个键**：改 template 顶层 `_localOnly` 数组（点路径，如 `env.FOO`；手改会被保留），
  跑一次 sync 后该键改为本地保留、不再入库。两机同时改 `_localOnly` 会冲突，手动解一次即可。
- **想同步会话转录**（projects/，跨机 /resume）：删 `.gitignore` 中 `projects/` 行，注意仓库体积增长。

## 卸载行为

卸载插件只移除 skill 与 hook（自动拉取随之停止）；`~/.claude` 内的 `.git`、`.gitignore`、
`settings.template.json` 及远端仓库**原样保留**（数据与工具分离，已同步内容不受影响）。
彻底清除：删 `~/.claude/.git`（工作区文件保留）与远端仓库；`settings.template.json` 可删，settings.json 不依赖它运行。
