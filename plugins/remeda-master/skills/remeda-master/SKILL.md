---
name: remeda-master
description: Use Remeda's functional utilities by default when remeda is a direct dependency in the current package's package.json (dependencies/devDependencies/peerDependencies). Applies to .ts and .tsx (React/JSX) — prefer pipe/filter/map/conditional/groupBy/setPath over hand-written loops, multi-level switch/if-else, and mutable updates, while keeping code readable. Also use when refactoring imperative TypeScript/TSX to Remeda, choosing data-first for single steps and data-last for composition, or fixing Remeda type errors, but only when remeda is already a direct dependency. If remeda is NOT a direct dependency, do not introduce it or rewrite code to Remeda; use native JS/TS unless the user explicitly asks to install it. 触发词：remeda、函数式工具、pipe、conditional、TS/TSX 重构。
---

# Remeda Master

## 生效门禁

先确认当前包是否直接安装了 Remeda：看正在编辑的 workspace 包 `package.json` 中 `dependencies` / `devDependencies` / `peerDependencies` 是否声明 `remeda`。lockfile 只能作辅助证据（它可能只是传递依赖，pnpm 等严格布局下未必能直接 `import`）。

- **有 Remeda**：集合、对象、条件分支的转换优先用 Remeda。这是默认做法，不用等用户点名。看到 `for`/`forEach` 累加、手写分组计数、多层 `if/else`、直接改对象字段时，先检查对应的 Remeda 函数，有就直接用。
- **没有 Remeda**：不要为了“函数式”擅自引入依赖，也不要硬套。用原生 TS/JS；只有用户明确要求时才建议 `npm i remeda`。
- 即便已安装，如果原生写法更短更清楚（单次 `map`、静态路径 `?.`/`??`），保留原生。Remeda 是工具，不是教条。
- 导入用具名导入：`import { pipe, filter, map } from "remeda"`。

## 心智模型

1. **双 API**：单步用 data-first `filter(items, fn)`，最直接；2 步以上或需要复用用 data-last `pipe(items, filter(fn), ...)` / `filter(fn)`。data-last 的价值在组合与复用，不是所有地方都更清楚。Remeda 不是 Ramda：没有 `_` 占位符。
2. **不可变**：函数返回新数组/对象，不修改入参。`sortBy`、`setPath`、`mergeDeep` 都是如此。
3. **惰性 `pipe`**：直接写在 `pipe` 里的 data-last 函数（`map`、`filter`、`take`、`find`、`first`、`unique` 等）会融合并短路；包成 `($) => filter($, fn)` 会关闭惰性。`map` / `filter` 等回调的第三个参数只含已处理的前缀，不要依赖完整数组。

## 默认决策顺序

1. 单步 → data-first，直接调用：`filter(users, fn)`、`conditional(status, ...)`。
2. 两步以上或需要复用 → data-last + `pipe`：`pipe(data, fn(...), ...)`；复用变换可以先 `const fn = filter(...)`。要复用整条管道就写具名函数、显式声明参数，再在函数体里用 `pipe`；不要用 `piped` 当独立工厂（TypeScript 推不出入参类型）。
3. 分支：1–2 个 → `when` / 三元；3 个以上或需要返回值 → `conditional`。
4. 管道超过 4–5 步、或中间结果有业务含义 → 提取具名常量/函数，不要硬写 point-free。
5. 改完跑类型检查；不要用 `as any` 压下去。

## 场景 1：多层 switch / if-else → conditional

```ts
type OrderStatus = "paid" | "shipped" | "cancelled";

// before
function getLabel(status: OrderStatus) {
  switch (status) {
    case "paid": return "已支付";
    case "shipped": return "已发货";
    default: return "未知";
  }
}

// after：单步使用，data-first
const getLabel = (status: OrderStatus) =>
  conditional(
    status,
    [(s) => s === "paid", constant("已支付")],
    [(s) => s === "shipped", constant("已发货")],
    constant("未知"), // 兜底：最后一个 case 写成单个函数
  );
```

`if / else if` 链同理：把每个条件写成 `[predicate, transformer]`，最后留一个 default 函数。

- 每个 case 是 `[predicate, transformer]`；最后一个单函数是 default。
- **没有匹配且没有 default 会抛异常**，不是返回 `undefined`。写 default，或确认分支穷尽。
- 固定返回值用 `constant(value)`；需要基于数据计算时直接用 `(x) => ...`。
- **复用或组合时用 data-last**：`conditional(...)(val)` 本身是合法写法，不是禁用；`const label: (s: OrderStatus) => string = conditional([...], constant("未知"))` 还能把 cases 复用。但直接写 `conditional(...)(status)` 时，TypeScript 没有数据参数来锚定 `T`，strict 下常推不出类型；给返回函数标注类型、或放进 `pipe(status, conditional(...))` 即可。
- **类型收窄的范围**：每个 case 可以写自己的类型谓词，transformer 会收窄（`[(x): x is Circle => x.kind === "circle", (x) => x.r]`）。但后面的 case 和 fallback 不会继承前面 case 的否定收窄；需要那种收窄时，保留 `switch` / 三元。

## 场景 2：手写循环 → pipe

```ts
// before
const result: Record<string, string[]> = {};
for (const u of users) {
  if (!u.active) continue;
  (result[u.team] ??= []).push(u.name);
}
for (const team of Object.keys(result)) {
  result[team].sort(); // 与 sortBy 一样按 code unit 比较
}

// after
const result = pipe(
  users,
  filter((u) => u.active),
  sortBy(prop("name")),
  groupByProp("team"),
  mapValues(map(prop("name"))),
);
```

- `sortBy` 返回副本，不会像 `Array.prototype.sort` 那样改原数组。降序：`sortBy([prop("age"), "desc"])`；多条件：`sortBy(prop("team"), [prop("age"), "desc"])`。它用原生 `<` / `>` 比较，不是 `localeCompare`；中文或本地化排序用 `sort((a, b) => a.name.localeCompare(b.name))`。
- `groupBy` / `groupByProp`：key 是字面量联合时返回 partial record，`groups[key]` 可能 `undefined`；key 是 `string` 时是完整 Record。统一用 `groups[key] ?? []` 或 `entries(groups)` 最稳。
- 单步用 data-first：`filter(users, (u) => u.active)`、`sumBy(users, (u) => u.age)`；上面这条是 4 步转换，所以用 `pipe` + data-last。
- 不要用 `reduce` 去做 `map` / `filter` 能直接表达的事。

## 场景 3：可选值 / 深层取值

```ts
type Order = { shipping: { address: { city?: string; zip?: string } } };
const order: Order = { shipping: { address: { city: "北京", zip: "100000" } } };

const name = when(maybeUser?.nickname, isNullish, constant("匿名"));
const city = pipe(order, prop("shipping", "address", "city"), defaultTo("未知"));
const zip = pipe(order, prop("shipping", "address", "zip"), defaultTo("000000"));
const email = defaultTo(maybeUser?.email, "未填写");
```

- `prop(obj, ...keys)`（data-first）/ `prop(...keys)(obj)`（data-last）支持编译期已知的深层路径；任一层为 `null` / `undefined` 时返回 `undefined`，配合 `defaultTo` 使用。
- `defaultTo(data, fallback)`（data-first）/ `defaultTo(fallback)(data)`（data-last）只处理 `null` / `undefined`，不会把 `0`、`false`、`""` 当空值。data 必须可能为空，否则类型系统会拒绝这个 fallback。
- `pathOr` 自 2.28.0 起 deprecated，不要再写；等价写法是 `pipe(obj, prop(...keys), defaultTo(fallback))`。
- 静态浅路径用原生 `maybeUser?.nickname ?? "未知"` 更直接。运行时动态的 `string[]` 路径 `prop` 不支持（key 受 `KeysDeep<T>` 约束），需要自己写带类型的 getter。

## 场景 4：不可变更新

```ts
// order 沿用场景 3；单步更新，data-first
const moved = setPath(order, ["shipping", "address", "city"], "上海");
const next = mergeDeep(order, { shipping: { address: { city: "北京" } } });
const aged = evolve({ age: 30 }, { age: (age) => age + 1 });
```

- `set(obj, key, value)`、`setPath(obj, path, value)`、`merge(data, source)`、`mergeDeep(destination, source)`、`evolve(data, evolver)`；放进管道时用 data-last：`setPath(path, value)(data)`、`mergeDeep(source)(data)`、`evolve(evolver)(data)`。
- `setPath` 要求路径中间层在类型中存在；中间层可能为空时用 `mergeDeep` 或展开。Remeda 没有 `assoc`、`modify`、`lens`——那是 Ramda 的 API。

## 场景 5：类型收窄

```ts
const emails = pipe(
  users,
  map(prop("email")),     // (string | undefined)[]
  filter(isNonNullish),   // string[]
  map((e) => e.toLowerCase()),
);

const [adults, minors] = partition(users, (u) => u.age >= 18);
```

- 用 `isDefined` / `isNonNullish` 或自定义 type predicate 做 `filter`，结果类型会自动收窄。`isDefined` 只排除 `undefined`（`null` 仍保留）；要同时排除 `null` 用 `isNonNullish`。
- `partition(data, predicate)`（data-first）/ `partition(predicate)(data)`（data-last）返回 `[匹配项, 不匹配项]`。

## 场景 6：TSX / React

Remeda 是纯函数工具集，可直接用于 `.tsx`，不需要包装组件（`forEach` 例外，它是显式副作用函数，render 里不要用）。关键是把“数据转换”和“渲染”分开。

```tsx
function TeamList({ users }: { users: User[] }) {
  const groups = pipe(
    users,
    filter((u) => u.active),
    sortBy(prop("name")),
    groupByProp("team"),
  );
  const teams = entries(groups);

  return (
    <div>
      {teams.map(([team, members]) => (
        <section key={team}>
          <h2>{team}</h2>
          {members.map((u) => (
            <Row key={u.id} user={u} />
          ))}
        </section>
      ))}
    </div>
  );
}
```

```tsx
const StatusBadge = ({ user }: { user: User }) =>
  conditional(
    user,
    [(u) => u.banned, constant(<Badge tone="red">已封禁</Badge>)],
    [(u) => !u.verified, constant(<Badge tone="amber">待验证</Badge>)],
    constant(<Badge tone="green">正常</Badge>),
  );
```

TSX 注意：

- 管道放在 `return` 之前或组件外。不要把 5 步 `pipe` 塞进 JSX 表达式。
- **不要**把渲染期新建的 data-last 函数（如 `filter(fn)`）放进 `useMemo` 依赖：每次渲染都是新引用，依赖永远变化。要缓存就缓存**结果**，或把管道写成模块级具名函数（内部用 `pipe`）。
- `map` / `filter` 回调保持纯函数；惰性管道里不要放副作用。
- 每个 `conditional` case 用类型谓词可以收窄自己的 transformer；但 fallback / 后续 case 不继承前面的否定收窄，需要跨分支收窄时用 `switch` / 三元。

## 任务速查

| 需求 | 用法 |
|---|---|
| 选取 / 转换 | `filter`、`map`、`flatMap` |
| 排序 | `sortBy(prop("x"))`、`sortBy([prop("x"), "desc"])`、`sort` |
| 分组 / 计数 / 求和 | `groupBy`、`groupByProp`、`countBy`、`sumBy` |
| 查找 / 去重 | `find`、`first`、`firstBy`、`unique`、`uniqueBy` |
| 拆分 / 截取 | `partition`、`chunk`、`take`、`drop` |
| 默认值 / 深层取值 | `defaultTo`、`prop`（`pathOr` 已废弃） |
| 不可变更新 | `set`、`setPath`、`merge`、`mergeDeep`、`evolve` |
| 对象转换 | `mapValues`、`mapKeys`、`entries`、`fromEntries` |
| 条件 | `when`、`conditional`、`constant` |

## 规则与反模式

- **不要臆造函数**。2.x 没有 `cond`、`ifElse`、`unless`、`assoc`、`modify`、`lens`、`ascend` / `descend`、`equals`、`propEq`。对应写法是 `conditional`、`when`、`setPath`、`isDeepEqual`。
- **单步 data-first，组合 data-last**：`filter(items, fn)` 用于单次；`pipe(items, filter(fn), ...)` 用于 2 步以上或复用。单独 `filter(fn)(items)` 通常推不出元素类型（strict 下报错），放进 `pipe` 或显式给类型参数；`filter(fn, items)` 是错的。
- 单参数函数的 data-last 要显式调用：`first()`、`unique()`、`entries()`；类型守卫直接传 `isNonNullish`，不要加括号。
- `reduce` 的 `initialValue` 必填；`conditional` 的 predicate / transformer 只接收 value，不要写 `(value, index)`。
- `mapValues` 回调是 `(value, key)`，`mapKeys` 是 `(key, value)`；`pick` / `omit` 的键是数组，不是可变参数。`first([])` 返回 `undefined`。
- 不要为了 point-free 把代码写得比命令式更难读；类型报错先查 `.d.ts`，不要 `as any`。

## 版本与签名

本文基于 **remeda 2.52.0**。`defaultTo` 需要 2.28+，更早的 2.x 用 `pathOr`（当时还没废弃）；多级 `prop` 在 2.27+ 可用。v1.61 的 `conditional` 用 `conditional.defaultCase` 写兜底，也没有 `when`，不要照搬示例。

示例已用 2.52.0 + TypeScript strict 编译验证。签名不确定时查 `node_modules/remeda/dist/index.d.ts` 或 https://remedajs.com/docs/，不要凭记忆写。
