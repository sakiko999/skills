---
name: cf-project
description: 按需把 Cloudflare 开发环境激活到当前项目：项目级启用 cloudflare 插件、把 token 认证的 4 个 CF MCP 服务器合并进项目根的 .mcp.json，幂等执行且不破坏已有配置；也负责反向的停用移除。只要用户想在项目里做 Cloudflare 相关工作——Workers、Wrangler、R2、D1、KV、Queues、Durable Objects、部署到 workers.dev/pages、CF 日志/报错排查、cf 费用与配置——或明确要求"激活/启用/接入/配置 CF 或 cloudflare"，就应使用本技能（激活脚本）。用户要求"停用/移除/拆掉/清理 CF"时同样使用本技能（停用脚本）。即使用户没说出"激活/停用"这些字，只要意图是在这个项目里开展或撤出 Cloudflare 工作，就用它。不适用：纯问答式询问 CF 文档概念、不涉及在本地项目里实际操作 Cloudflare 的场景。
---

# CF 项目激活（cf-project）

背景：这台机器**全局禁用了** cloudflare 插件、全局 MCP 里也没有 CF 服务器——这是刻意为之，为的是避免插件 OAuth 凭据重新写进 `~/.claude/.credentials.json`。因此 CF 能力采用"按项目点亮"的模式：MCP 走 API token（配置里只写 `${CLOUDFLARE_API_TOKEN}` 变量引用，无明文密钥），插件在项目级启用。MCP 模板内置于本技能（`assets/cloudflare-mcp.json`），本技能把它**复制合并**进项目（若 `~/.claude/.mcp.json` 存在则优先用作覆盖源，没有也不影响）。

## 步骤

1. **找项目根目录**：优先 `git -C <cwd> rev-parse --show-toplevel`，失败就用当前目录。配置放根目录即可——Claude Code 查找 `.mcp.json` 时会从 cwd 向上遍历，子目录里打开的项目同样生效。

2. **运行打包脚本**（幂等，可放心重复运行）：

   ```bash
   python3 <本技能目录>/scripts/activate_cf.py <项目根目录>
   ```

   变体按需选用：
   - `--no-plugin`：只写 `.mcp.json`，不启用插件。用户表示"只用 token 认证 / 不想碰 OAuth"时用这个。
   - `--settings project`：把插件启用写进团队共享的 `.claude/settings.json`（默认写个人的 `settings.local.json`）。
   - `--keep-plugin-mcp`：跳过 OAuth 屏蔽名单（默认激活时会自动预写，见下节）。

3. **检查脚本输出**：确认 `.mcp.json` 与 settings 文件写入成功、原有服务器被保留、`CLOUDFLARE_API_TOKEN` 状态为就绪。若脚本报"不是合法 JSON"，那是项目已有配置损坏——停下来请用户手工修复，绝不要擅自重建覆盖。同时核对输出首行的 `项目根:` 确实是用户所指的项目（无参运行时脚本会回退到 git 根或当前目录），不一致立即停下重跑。

4. **醒目转达生效方式（红线，见下）**：配置只写盘，当前会话不会自动生效。**必须重启 claude**——实测 `/reload-plugins` 只热载插件/skills/agents，不会重扫项目 `.mcp.json`，让用户跑它是浪费力气。提示用户：重启后上下文用 `claude --continue` 找回，再用 `/mcp` 确认 4 个 `cloudflare-*` 已连接。

## 停用（反向操作）

用户想给项目"停用/移除/拆掉/清理 CF"时，运行：

```bash
python3 <本技能目录>/scripts/deactivate_cf.py <项目根目录>
```

它是激活的精确逆操作，同样幂等、只做减法：

- 从 `.mcp.json` 移除 4 个 CF 服务器；若文件里除了 CF 什么都没有，连文件一起删除，`my-api` 之类的其他服务器永远保留
- 从 `.claude/settings.local.json` 与 `.claude/settings.json` 移除 CF 插件启用与 MCP 预批准；文件清空后自动删除（空 `.claude/` 目录一并收掉）
- 自动移除当初 `--block-plugin-mcp` 写进 `~/.claude.json` 的 OAuth 屏蔽名单
- `.gitignore` 里的 `.claude/settings.local.json` 忽略行**有意保留**：该规则对任何用 local settings 的项目都成立，不是 CF 专属
- 全局本来就是禁用状态，停用单个项目不需要（也不应该）去动全局配置
- 完成后同样必须醒目提醒用户**重启 claude** → `/mcp` 验证（红线同上）

## 红线

- 永远不要覆盖项目已有的 `.mcp.json` 或 settings 文件——脚本只做合并。绕过脚本手写配置时同样只做合并。
- 用户说"把认证文件移动到项目下"指的是把配置带进项目，实际操作是**复制合并**——模板保存在技能内（`assets/cloudflare-mcp.json`），供所有项目复用，不要删除或改动它。
- 脚本依赖 `python3`（仅标准库）；环境异常时不要用一堆手工 jq 命令替代后宣称完成。脚本任何报错（包括 traceback）一律原样报告并停止，不得绕道达成效果。
- 激活/停用完成后，绝不能只说"已完成"——必须在回复里用醒目方式（加粗、单独一段）提醒用户：**必须重启 claude**（实测 `/reload-plugins` 不加载新增的项目 `.mcp.json`），上下文用 `claude --continue` 找回，重启后 `/mcp` 验证。用户反复反馈过这个点。

## OAuth 重复说明

启用插件后，它自带的 4 个 OAuth 版 MCP 服务器（`cloudflare-api/builds/observability/bindings`）也会加载，与 token 版功能重复，并可能在 `~/.claude/.credentials.json` 里重新留下 OAuth 凭据。因此激活脚本**默认**就预写禁用名单（尽力而为，写入 `~/.claude.json` 的 `projects[目录].disabledMcpServers`；该文件会被运行中的会话重写，名单若"复活"重跑一次脚本即可）。兜底顺序：

1. 重启后在 `/mcp` 界面里确认；若 4 个 OAuth 版仍在，手动 disable（最可靠）；
2. 用户明确要保留插件的 OAuth MCP → `--keep-plugin-mcp`；
3. 用户完全不想碰 OAuth 风险 → `--no-plugin`。
