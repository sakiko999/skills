# Claude Code Skills

个人 Claude Code 技能（Skill）集合仓库。每个 skill 是一个独立目录，内含 `SKILL.md` 及 `references/` 参考文档。

## 使用方法

将需要的 skill 目录克隆或复制到你的 Claude Code skills 目录：

```bash
# 全局 skills 目录
mkdir -p ~/.claude/skills
cp -r ramda-master ~/.claude/skills/
```

然后在 Claude Code 中即可通过 `/ramda-master` 调用该 skill。

## 技能列表

### [ramda-master](ramda-master/)

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
- 新增 skill 时在本 README 的列表中加入条目。
