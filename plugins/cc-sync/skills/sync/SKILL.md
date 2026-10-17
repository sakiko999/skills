---
name: sync
description: 手动同步全局 ~/.claude 配置到 GitHub 私有仓库 sakiko999/dotclaude。纯提示词 skill：不装 hook、不自动 pull/push；用户说"同步配置 / 全局配置同步 / 新机导入配置"时使用。
---

# cc-sync（纯提示词）

本 skill 只提供步骤，不包含任何后台 hook 或自动同步。只有用户明确要求时才执行命令。

## 找仓库

- 仓库：`sakiko999/dotclaude`（私有）
- 查看：`gh repo view sakiko999/dotclaude --json url,isPrivate,defaultBranchRef`
- 找不到时按名字搜：`gh repo list sakiko999 --limit 100 --json name,isPrivate`
- 本机工作区是 `~/.claude`。检查是否已关联：`git -C ~/.claude remote -v`
- 未关联：`git -C ~/.claude remote add origin https://github.com/sakiko999/dotclaude.git`
- 新机：`git -C ~/.claude init -b main` 后加 remote，再
  `git -C ~/.claude fetch origin main && git -C ~/.claude checkout origin/main -- CLAUDE.md .claude-sync settings.template.json`。
  `settings.json` 使用本机的一份，不要从仓库覆盖。

## 同步范围

- 入库：`CLAUDE.md`、`.claude-sync/`、`settings.template.json`、`session-memories/`
- 不入库：`settings.json`、`.credentials.json`、`projects/`、`plugins/cache/`、`plugins/marketplaces/`、
  `plans/`、`dev-mods/`、各类缓存

## settings 必须过滤的模型信息

模型路由与上下文参数是各机注入的，跨机同步会互相覆盖。生成或更新 `settings.template.json` 前删除：

- `model`、`modelPicker`
- `env.ANTHROPIC_MODEL`、`env.ANTHROPIC_SMALL_FAST_MODEL`
- `env.ANTHROPIC_DEFAULT_HAIKU_MODEL`、`env.ANTHROPIC_DEFAULT_SONNET_MODEL`、`env.ANTHROPIC_DEFAULT_OPUS_MODEL`
- `env.CLAUDE_CODE_SUBAGENT_MODEL`、`env.CLAUDE_CODE_MODEL_CAPABILITIES`

把这些点路径写进 template 的 `_localOnly` 作为声明；`settings.json` 本身不动。

以下参数**需要同步**，不要过滤：`env.CLAUDE_CODE_EFFORT_LEVEL`、
`env.CLAUDE_CODE_MAX_OUTPUT_TOKENS`、`env.CLAUDE_CODE_MAX_CONTEXT_TOKENS`、
`env.CLAUDE_CODE_AUTO_COMPACT_WINDOW`、`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`。

在 `~/.claude` 手动过滤：

```bash
jq 'del(.model, .modelPicker,
  .env.ANTHROPIC_MODEL, .env.ANTHROPIC_SMALL_FAST_MODEL,
  .env.ANTHROPIC_DEFAULT_HAIKU_MODEL, .env.ANTHROPIC_DEFAULT_SONNET_MODEL, .env.ANTHROPIC_DEFAULT_OPUS_MODEL,
  .env.CLAUDE_CODE_SUBAGENT_MODEL, .env.CLAUDE_CODE_MODEL_CAPABILITIES)
  | ._localOnly = (((._localOnly // []) + ["model", "modelPicker",
      "env.ANTHROPIC_MODEL", "env.ANTHROPIC_SMALL_FAST_MODEL",
      "env.ANTHROPIC_DEFAULT_HAIKU_MODEL", "env.ANTHROPIC_DEFAULT_SONNET_MODEL", "env.ANTHROPIC_DEFAULT_OPUS_MODEL",
      "env.CLAUDE_CODE_SUBAGENT_MODEL", "env.CLAUDE_CODE_MODEL_CAPABILITIES"]) | unique)' settings.template.json > /tmp/tpl \
  && mv /tmp/tpl settings.template.json
```

## 手动拉取

```bash
git -C ~/.claude fetch origin main
git -C ~/.claude log --oneline HEAD..origin/main   # 先看远端改了什么
git -C ~/.claude status --short                    # 有本地改动先 commit 或 stash
git -C ~/.claude merge origin/main                 # 或 rebase
```

`settings.json` 不随仓库覆盖：远端 template 只作参考，密钥和本机值手动合并。

## 手动推送

```bash
git -C ~/.claude add CLAUDE.md .claude-sync settings.template.json session-memories
git -C ~/.claude commit -m "config: ..."
git -C ~/.claude pull --rebase origin main
git -C ~/.claude push
```

冲突：`settings.template.json` 两边改同一键时手动保留本机值；模型相关键已被过滤，不会参与冲突。

## 禁止

- 不添加 SessionStart hook，不后台拉取
- 不自动 pull/push/commit
- 不提交 `settings.json`、`.credentials.json` 或任何 token
