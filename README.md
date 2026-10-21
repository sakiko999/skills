# Claude Code Skills

个人 Claude Code 技能（Skill）集合仓库，以 **Claude Code 插件 marketplace** 形式分发。

## 安装（marketplace 方式，推荐）

添加本仓库为插件市场，然后安装插件：

```bash
# 在 Claude Code 中执行
/plugin marketplace add sakiko999/skills
/plugin install ramda-master@sakiko999-skills
/plugin install remeda-master@sakiko999-skills
/plugin install cf-project@sakiko999-skills
/plugin install cc-sync@sakiko999-skills
/plugin install cc-todo@sakiko999-skills
```

装好后通过 `/ramda-master:ramda-master` 或 `/remeda-master:remeda-master` 调用对应 skill（插件 skill 带命名空间前缀），或在对话中直接提到 Ramda / Remeda 让 Claude 自动调用。

更新插件：

```bash
/plugin marketplace update
/plugin update
```

## 备选：直接复制 skill 目录

```bash
mkdir -p ~/.claude/skills
cp -r plugins/ramda-master/skills/ramda-master ~/.claude/skills/
cp -r plugins/remeda-master/skills/remeda-master ~/.claude/skills/
cp -r plugins/cf-project/skills/cf-project ~/.claude/skills/
```

然后在 Claude Code 中通过 `/ramda-master` 或 `/remeda-master` 调用。

## 技能列表

### [ramda-master](plugins/ramda-master/skills/ramda-master/)

> Master Ramda for TypeScript — 编写正确、地道、类型安全的 Ramda 代码。

- **SKILL.md**：主文件，包含 Ramda 心智模型、转换配方、Review 检查清单、教学与推荐模式
- **references/functions.md**：按任务索引的函数字典（含已验证签名）
- **references/patterns.md**：命令式 → Ramda 转换模式
- **references/anti-patterns.md**：常见陷阱清单（参数顺序、不存在的函数、变异 bug 等）
- **references/typescript.md**：`@types/ramda` 类型推断陷阱及修复模式
- **references/concepts.md**：概念深度讲解（curry、data-last、lens、point-free 等）

签名基于 **Ramda 0.32.0** / `@types/ramda 0.32.0` / `types-ramda 0.32.0` 验证。

### [remeda-master](plugins/remeda-master/skills/remeda-master/)

> 优先使用 Remeda 函数式工具（TypeScript / TSX）：用 `conditional` 替代多层 switch/if-else，用 `pipe` 替代手写循环，并覆盖不可变更新、类型收窄与 React/TSX 用法。

- **SKILL.md**：单文件，包含生效门禁、心智模型、决策顺序、6 个场景示例（conditional / pipe / 可选值 / 不可变更新 / 类型收窄 / TSX）、任务速查表与反模式
- 单步 data-first、组合 data-last：简单调用直接传数据，多步转换用 `pipe` 串联
- 仅在当前包直接依赖 `remeda` 时生效；未安装时不擅自引入
- 示例基于 **remeda 2.52.0 + TypeScript strict** 编译验证（`defaultTo` 需要 2.28+，多级 `prop` 需要 2.27+）

## 贡献

- 每个 skill 遵循 Claude Code skill 规范：目录含 `SKILL.md`（YAML frontmatter 带 `name` 和 `description`）+ 按需的 `references/`。
- 新增 skill 时在 `plugins/<name>/` 下创建插件目录（含 `.claude-plugin/plugin.json` 与 `skills/<name>/`），并在 `marketplace.json` 与 README 中登记。

### [cf-project](plugins/cf-project/skills/cf-project/)

> 按需把 Cloudflare 开发环境激活/停用到当前项目：项目级启用 cloudflare 插件、token 认证的 CF MCP 服务器写入项目根 `.mcp.json`，幂等执行且不破坏已有配置。

- **SKILL.md**：触发条件、激活/停用流程、红线（只合并不覆盖、损坏 JSON 停手、必须重启会话生效）
- **scripts/activate_cf.py**：激活（合并 4 个 CF MCP 服务器、项目级启用插件、默认预写 OAuth 屏蔽名单、检查 token）
- **scripts/deactivate_cf.py**：停用（精确逆操作，同名自有服务器智能保留）
- **assets/cloudflare-mcp.json**：CF MCP 模板（唯一事实源，token 走 `${CLOUDFLARE_API_TOKEN}` 环境变量）

### [cc-todo](plugins/cc-todo/)

> 每轮自动记录 TODO / 重要信息，输入框上方常驻显示；`/todo open` 打开可滚动面板。

- **hooks/register.tsx**：`turn.complete` / `prompt.submit` 扫描消息，`prompt.compose` 注入 `!!todo` / `!!important` 标记说明，`AbovePrompt` 画常驻列表，`Pane` 画面板
- **hooks/extract.ts**：识别 `TODO:`、`IMPORTANT:`、`- [ ]`、`注意:`、`待办：`、`!!todo` 等行首标记，忽略代码块
- **hooks/claude-md.ts**：读写项目根目录 `CLAUDE.md` 中的受管区块，只改写 `<!-- cc-todo:start -->` 到 `<!-- cc-todo:end -->` 之间的内容
- **命令**：`/todo` 查看、`/todo open` 打开面板、`/todo close` 关闭面板、`/todo add <文本>`、`/todo important <文本>`、`/todo done <n>`、`/todo clear`
- 记录直接写入项目根目录的 `CLAUDE.md`——同一项目的所有会话、resume 和重启共享；`/todo clear` 删除受管区块，`/clear` 不影响项目记录
- 测试：`claude plugin test plugins/cc-todo`
