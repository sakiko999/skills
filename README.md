# Claude Code Skills

个人 Claude Code 技能（Skill）集合仓库，以 **Claude Code 插件 marketplace** 形式分发。

## 安装（marketplace 方式，推荐）

添加本仓库为插件市场，然后安装插件：

```bash
# 在 Claude Code 中执行
/plugin marketplace add sakiko999/skills
/plugin install ramda-master@sakiko999-skills
```

装好后通过 `/ramda-master:ramda-master` 调用该 skill（插件 skill 带命名空间前缀），或在对话中直接提到 Ramda 让 Claude 自动调用。

更新插件：

```bash
/plugin marketplace update
/plugin update
```

## 备选：直接复制 skill 目录

```bash
mkdir -p ~/.claude/skills
cp -r plugins/ramda-master/skills/ramda-master ~/.claude/skills/
```

然后在 Claude Code 中通过 `/ramda-master` 调用。

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

## 贡献

- 每个 skill 遵循 Claude Code skill 规范：目录含 `SKILL.md`（YAML frontmatter 带 `name` 和 `description`）+ 按需的 `references/`。
- 新增 skill 时在 `plugins/<name>/` 下创建插件目录（含 `.claude-plugin/plugin.json` 与 `skills/<name>/`），并在 `marketplace.json` 与 README 中登记。
