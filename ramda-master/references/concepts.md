# Ramda concepts, explained

Each concept follows the Explain pattern from SKILL.md: **one-line positioning → why Ramda built it this way → minimal + realistic example → when NOT to use it**. Use these verbatim-ish when asked to explain a concept; adapt the realistic example to the user's domain.

## Currying

**One line**: turning `f(a, b, c)` into `f(a)(b)(c)` — call it with some args, get back a function waiting for the rest.

**Why Ramda does this**: it's the glue that makes "data-last" useful. `R.map(fn)` alone is a *pre-configured* transformer you can reuse or slot into a `pipe`. Without auto-currying you'd have to write `list => R.map(fn, list)` every time — which is exactly the boilerplate curry eliminates.

**Minimal**:
```ts
const add = R.add;            // (a, b) → number
const add5 = R.add(5);        // partially applied
add5(3);                      // 8
```

**Realistic**: a configurable formatter:
```ts
const formatPrice = R.pipe(R.multiply(1.2), R.toFixed, (s: string) => `$${s}`);
// reuse across pipelines without repeating the config
```

**Placeholder `R.__`**: fills a *specific* gap. `R.subtract(R.__, 5)` = "5 − whatever comes later" (a reusable "reciprocal" subtractor). Without it you cannot partially apply the *second* argument, which you often need for comparisons: `R.gt(R.__, 18)` = "is x > 18".

**When NOT to**: over-curried code is hard to read. If a pipeline is one call to `R.map(R.currySomething(...))`, a plain lambda is clearer.

## Data-last / data-final

**One line**: the data you operate on is the *last* argument (`R.map(fn, list)`), enabling curried pre-configuration.

**Why**: Ramda is built for *composition of reusable functions*, not for one-shot calls. Data-last + curry means `R.filter(isAdult)` is itself a predicate-transformer you compose *before* the data exists. Lodash is data-first because it optimizes for the imperative `_.map(list, fn)` call; Ramda optimizes for `R.pipe(R.map(fn), R.filter(pred))`.

**Realistic**:
```ts
// data-last enables this: build the pipeline first
const process = R.pipe(
  R.filter((x: number) => x > 0),
  R.map(String),
);
const result = process(data);   // data arrives at the end
```

**When NOT to**: standalone single calls read fine either way; don't contort to force data-last.

## Point-free style

**One line**: defining functions without naming their arguments — `R.map(R.inc)` instead of `xs => R.map(x => x + 1, xs)`.

**Why**: it's a *consequence* of data-last + curry, not a goal. When a transform is just a composed Ramda pipeline, the arguments are implied and naming them adds noise.

**Realistic**:
```ts
// point-free
const doubleEven = R.pipe(R.filter((x: number) => x % 2 === 0), R.map(R.multiply(2)));
// imperative-ish equivalent
const doubleEven = (xs: number[]) => xs.filter(x => x % 2 === 0).map(x => x * 2);
```

**The honest truth (when NOT to)**: point-free is a *readability tool*, and it often fails. If the point-free version requires a custom `R.curry` or `R.__` gymnastics that obscure what's happening, keep the named arguments. TypeScript also degrades point-free readability at the type-seam (annotating a pipe's stage is easier with named params). Rule of thumb: point-free when it removes lambda noise; named params when a lambda would be clearer. Never both.

## `pipe` vs `compose`

**One line**: `pipe(f, g)(x)` = `g(f(x))`; `compose(f, g)(x)` = `f(g(x))` — they're the same thing read in opposite directions.

**Why two exist**: `compose` is the mathematician's notation (matches nested function application), `pipe` is the data-flow notation (reads top-to-bottom like the data moves). Ramda offers both because different codebases think differently.

**When to use which**: default to `pipe` — data flows left→right, matches how you read code, and TypeScript checks seams in the same order. Use `compose` only when the nesting is genuinely clearer (small combinators, `R.o`).

## Lenses

**One line**: a lens is a **getter + setter for a specific path, packaged as a reusable value** — so you can read, write, or transform "whatever is at `path`" without repeating the path.

**Why**: plain `assoc`/`prop` need the path written out each time. A lens captures the path once and gives you three verbs: `view` (read), `set` (write), `over` (transform). Lenses also compose (`R.compose(lensA, lensB)`) — the killer feature for deep nested updates.

**Minimal**:
```ts
const ageLens = R.lensProp<User, 'age'>('age');  // S (object) first, then K (key)
R.view(ageLens, user);   // 30
R.set(ageLens, 31, user);   // new user, age 31
R.over(ageLens, R.inc, user);  // new user, age 31
```

**Realistic**: updating a nested address in an immutable state object:
```ts
const cityLens = R.lensPath(['address', 'city']);
const state2 = R.over(cityLens, R.toUpper, state);
```

**When NOT to**: for a *one-off* nested update, `R.assocPath(['address','city'], 'Paris', obj)` is simpler and needs no lens typing. Lenses pay off when the path is used across the codebase or composed. **TS trap**: a hoisted `const l = R.lensProp('age')` infers `never` — inline it or annotate (`R.lensProp<User, 'age'>('age')`, S first).

## `evolve` — structural transformation

**One line**: `evolve` applies a *transform map* shaped like the data, recursively — "for each field, apply this function."

**Why**: nested updates normally read as nested spreads (`{...a, b: {...a.b, c: f(a.b.c)}}`), which are noisy and error-prone. `evolve` mirrors the data shape with functions and returns a new object, types flowing for free.

**Minimal**: `R.evolve({ age: R.inc }, { name: 'x', age: 30 })` → `{ name: 'x', age: 31 }`.

**Realistic**: normalize an API payload:
```ts
const normalized = R.evolve({
  user: { name: R.toUpper, profile: { joinedAt: (d: string) => new Date(d) } },
  items: R.map((x: { price: number }) => ({ ...x, price: x.price * 100 })),
}, payload);
```

**Subtle behaviors (verified)**: a transformer returning `undefined` **deletes** that key; `R.__` as a transformer leaves the value untouched; nested arrays can be transformed with an array-shaped transform map (`R.evolve([R.inc, R.dec], [1,1])` → `[2,0]`).

**When NOT to**: when the transformation isn't a per-field function (needs access to sibling fields) — then `R.applySpec` or explicit `pipe` is better.

## `applySpec`

**One line**: object of functions → a function that returns an object of their results, evaluated on the same input.

**Why**: replacing scattered object-literal construction with a *spec* makes the shape a reusable, testable, composable transformer — the functional answer to "build this DTO."

**Realistic**: shaping an API response:
```ts
const toSummary = R.applySpec<Summary>({
  total: R.sum,
  count: R.length,
  first: R.head,
  label: R.prop('name'),
});
```

**When NOT to**: a one-off literal is fine as-is; `applySpec` shines when the shape is reused or composed. Note it applies each branch to the *whole* input (unlike `evolve`, which matches nested shapes).

## `cond`

**One line**: the functional replacement for `if/else if/else` — a list of `[predicate, result]` pairs, first match wins.

**Why**: `if/else` chains are statements that *compute* a value; `cond` is an *expression* that returns one, and it's data — the pairs are just arrays you can build dynamically. Ramda prefers expressions over statements.

**Realistic** (with TS generics):
```ts
const grade = R.cond<[number], string>([
  [R.gt(R.__, 90), R.always('A')],
  [R.gt(R.__, 80), R.always('B')],
  [R.T, R.always('C')],
]);
```

**When NOT to**: if you need `else` with side effects, or fewer than 3 branches, `when`/`unless`/`ifElse` read better than a `cond` with one pair. And a `switch` with `fallthrough` is still not expressible — keep the imperative there.

## `defaultTo` and friends

**One line**: `defaultTo(default, x)` returns `x` if it's not `null`/`undefined`/`NaN`, else the default — the null-safe read.

**Why**: Ramda functions often operate on possibly-nullish data (from optional chaining, API responses, `path` lookups). `defaultTo` and its path-aware cousins (`pathOr`, `propOr`) keep pipelines total — no `TypeError` halfway through a `pipe`.

**Realistic**:
```ts
const city = R.pipe(R.propOr('', 'address'), R.propOr('', 'city'))(user);
// or for a known nesting:
const city = R.pathOr('', ['address', 'city'], user);
```

**When NOT to**: beware — `defaultTo` does **not** treat `0`, `''`, or `false` as missing (only nullish/NaN). For those semantics you need `R.or` or a custom guard. Also don't pepper defaults where a value must exist — let it throw and surface the bug.

## Transducers (`transduce` / `into`)

**One line**: a way to *fuse* a `map`+`filter` chain into a single pass — no intermediate arrays.

**Why**: `R.pipe(R.map(f), R.filter(p))` allocates two intermediate lists. Transducers rewrite that as one reducer traversal. Ramda's `transduce` lets you use `map`/`filter`/`take` as *transformers* over a `reduce` loop.

**Minimal**:
```ts
// In a transducer, the rightmost transformer sees each element first,
// so filter runs before map here — pick evens, then increment.
const xf = R.compose(R.filter((x: number) => x % 2 === 0), R.map(R.inc));
R.transduce(xf, R.flip(R.append), [], R.range(0, 10));
// [1, 3, 5, 7, 9]
```

**When NOT to**: honestly — almost always. The plain `pipe` version is clearer and the perf difference matters only on very large collections. Use transducers when (a) you've measured, or (b) you're combining an unbounded stream with `take`, where materializing all intermediate arrays is impossible. It's a "nice-to-know" concept for interviews and perf hot paths, not a daily tool.

## Fantasy Land (mention, don't dwell)

**One line**: a set of algebraic interfaces (Functor, Applicative, Monad, …) that Ramda functions can dispatch to — e.g. `R.map` works on `Maybe`, `Either`, and other fantasy-land-compatible types, not just arrays.

**Why it exists**: it lets libraries share one vocabulary of operators. `R.ap`, `R.chain`, `R.of` operate generically.

**When NOT to**: you'll only need it if you use a library built on it (most users never will). Just know `R.map`/`R.ap`/`R.chain` are polymorphic and will work on custom types that implement the interface.
