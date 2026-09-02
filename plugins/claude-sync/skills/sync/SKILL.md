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

1. `node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" init`
2. 若尚无远端仓库：`gh repo create dotclaude --private`，然后
   `git -C ~/.claude remote add origin https://github.com/<user>/dotclaude.git`
3. `node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" sync`（首次推送）

## 日常同步

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/sync/scripts/sync.mjs" sync
```

单向执行：回流本机改动 → commit → pull --rebase → 渲染回 settings.json → push。
幂等，任意时机可跑。

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
