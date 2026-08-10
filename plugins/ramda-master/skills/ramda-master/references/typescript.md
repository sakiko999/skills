# TypeScript + Ramda: inference traps and fixes

All behaviors verified against `@types/ramda 0.32.0` (which re-exports `types-ramda 0.32.0`). The types are built on `ts-toolbelt` and are *generally* excellent — the failures cluster in a few predictable places. This file documents those, with the working pattern for each.

**The root cause of most trap**: Ramda functions are heavily curried, so the type signatures are written so TS can infer *output* types from *input* types — but only when the inputs that carry the type are present at the call site. Hoist a partially-applied value (`const l = R.lensProp('age')`) and the carrying argument is gone, so TS picks its default (often `unknown`/`never`).

## The cardinal rule: inline what carries its type

If a `Lens`, `cond`, or partially-applied predicate is used exactly once, write it **inline** in the final call. Hoisting it to a `const` destroys inference.

**Trap 1 — `lensProp` hoisted to a const infers `never`.**

```ts
// ❌ BROKEN — l is Lens<unknown, never>
const l = R.lensProp('age');
const r = R.set(l, 99, user);   // TS2345: Lens<unknown, never> not assignable

// ✅ WORKS — S inferred from the surrounding call
const r = R.set(R.lensProp('age'), 99, user);

// ✅ WORKS — explicit generics when you must hoist.
// Real signature: lensProp<S, K extends keyof S = keyof S>(prop: K).
// S is the OBJECT type and comes FIRST; K is the key, second.
const l = R.lensProp<User, 'age'>('age');
```

Signature: `lensProp<S, K extends keyof S = keyof S>(prop: K): Lens<S, S[K]>`. Note `S` has no way to be inferred from `'age'` alone — you must provide it explicitly or via context.

**Trap 2 — `cond` needs explicit generics.**

```ts
// ❌ BROKEN — R is inferred as never / predicate inputs as any
const grade = R.cond([
  [R.gt(R.__, 90), R.always('A')],
  [R.gt(R.__, 80), R.always('B')],
  [R.T, R.always('C')],
]);

// ✅ WORKS — explicit tuple generics: T = the ARGUMENT TUPLE of the cond function.
// types-ramda 0.32 has NO cond<T, R> overload over a plain Array of pairs;
// ordinary boolean predicates (R.gt(R.__, 90), R.T) only fit the LAST overload
// cond<T extends any[], R>(pairs: Array<CondPair<T, R>>): (...args: T) => R.
// So the input must be written as a TUPLE [number], not a bare number.
const grade = R.cond<[number], string>([
  [R.gt(R.__, 90), R.always('A')],
  [R.gt(R.__, 80), R.always('B')],
  [R.T, R.always('C')],
]);
```

**Trap 3 — `either`/`both` require both predicates to share the exact same signature, and one type parameter.**

```ts
// ❌ BROKEN — two type params is an error; predicate sigs must match
const p = R.either<Person, boolean>(a => a.age >= 18, b => b.age >= 65);

// ✅ WORKS — one Fn type param; both lambdas must have identical signature
const p = R.either<Person>(a => a.age >= 18, a => a.age >= 65);
```

Signature: `either<Fn extends (...args: any[]) => boolean>(f: Fn, g: Fn): Fn`. If your two predicates naturally have different signatures, type the shared input: `R.either<Person>(p => ..., p => ...)`.

**Trap 4 — `assoc` is type-preserving, but the result is a `Record & Omit`, so read it through its fields, not its `typeof` string.**

```ts
const bob = { name: 'bob', age: 30 };
const bob2 = R.assoc('age', 31, bob);
// bob2: Record<'age', number> & Omit<typeof bob, 'age'>
// → bob2.name ✅ still accessible, bob2.age ✅ = 31
// Original bob untouched (immutability holds at the type level too).
```

The `Record<K, T> & Omit<U, K>` shape means field access works normally; you rarely need to annotate. If you do annotate, don't write `typeof R.assoc(...)` — name the expected shape.

**Trap 5 — `evolve` preserves the input's type but only for the shape you describe.**

```ts
const r = R.evolve({ age: R.inc }, { name: 'x', age: 30 });
// r.age: number ✅, r.name: string ✅
```

Good news: `evolve` is one of the few where the output type genuinely reflects the transform map. Use it over nested `assoc` chains — the type follows for free.

**Trap 6 — `pipe`/`compose` fail loudly when a stage's type mismatches — use that.**

```ts
// ❌ Compile error (TS2345) — the type checker catches the bug for you
const bad = R.pipe(
  (x: number) => x.toFixed(2),  // → string
  (s: number) => s * 2,         // ✗ expects number, got string
);
```

This is a feature. When a pipeline errors, annotate the *inputs of individual stages*, not the pipeline — stage-local annotations are what let TS check each seam.

**Trap 7 — `path`/`prop` return `unknown` (well, the deepest known type) — don't fight it with `as`, refine it.**

```ts
const deep = { a: { b: 1 } };
const v = R.path(['a', 'b'], deep);  // v: number ✅ (types-ramda drills into the literal path)
```

For *dynamic* paths (a `string[]` variable), `path` returns `unknown`. Then the idiomatic move is `R.pathOr(default, path, obj)` — give the default and let its type flow, instead of casting.

**Trap 8 — sortWith comparators need `ascend`/`descend`, and the type flows from the list.**

```ts
const people: Person[] = [...];
const sorted = R.sortWith([R.descend(R.prop('age')), R.ascend(R.prop('name'))], people);
// sorted: Person[] ✅
```

**Trap 9 — `pluck` on an array of objects keeps `undefined` for missing keys; its type is `(key: K) => S[K][]`.**

```ts
const ages = R.pluck('age', people);  // number[] ✅
// But R.pluck('missing', people) — TS won't stop you if the key isn't in the type,
// because the input may be a generic object. If you care, type the source.
```

**Trap 10 — `R.__` placeholders preserve types through partial application.**

```ts
const half = R.map(R.divide(R.__, 2));  // (list: number[]) => number[]
half([10, 20]);  // [5, 10] ✅
```

The placeholder doesn't degrade inference when the remaining argument is later supplied — `R.subtract(R.__, 5)` is `(x: number) => number`.

## Working patterns (copy these)

**Typed lens reuse** — hoist with explicit generics or define a typed factory:

```ts
const ageLens = R.lensProp<'age', Person>('age'); // WRONG: S must come first
const ageLens = R.lensProp<Person, 'age'>('age'); // ✅ S first, then K
const ageLens = (u: Person) => R.lensProp<typeof u, 'age'>('age'); // or a factory over typeof
```

**Typed cond** — always give the `<T, R>` generics, where T is the **argument tuple**:

```ts
const grade = R.cond<[number], string>([...]);
```

**Typed either/both** — one type param, identical predicate signatures:

```ts
const isEligible = R.both<Person>(p => p.age >= 18, p => p.age < 65);
```

**Typed evolve** — free; the transform map types the output.

**Trap 11 — `map`/`mapObjIndexed` over `R.groupBy`'s result fails to compile** (a types-ramda 0.32 quirk, verified).

`R.groupBy` returns `Partial<Record<K, T[]>>`. `R.map`/`R.mapObjIndexed` **reject** that type — TS overload resolution matches the *array* overload and fails with "not assignable to readonly T[][]". This fails with every spelling: `R.map(fn, dict)`, curried `R.map(fn)(dict)`, and explicit-generic `R.map<...>`. The fix is to give `mapObjIndexed` all three explicit type params, which selects the `PartialRecord` overload:

```ts
// ❌ All fail to compile: R.map(fn, byCountry), R.map(fn)(byCountry),
//   R.map<T, R>(fn, byCountry), R.mapObjIndexed(fn, byCountry)
const byCountry = R.groupBy((o: Order) => o.customer.country, bigOrders);

// ✅ Compiles — mapObjIndexed with explicit <Value, Result, Key> params.
//    The result is Partial<Record<string, number[]>> (undefined per missing key).
const idsByCountry = R.mapObjIndexed<Order[], number[], string>(
  (group) => group.map((o) => o.id),
  byCountry,
);
```

Note the trade-off: the `mapObjIndexed` result is `Partial<Record<...>>`, so accessing `idsByCountry['FR']` is `number[] | undefined`. If you need a plain `Record`, `Object.fromEntries(...)` (as in the eval outputs) or a narrow `as Record<string, number[]>` is the pragmatic route — and *that* `as` is justified, unlike a blanket `as any`. Flag this trade-off rather than dogmatizing one spelling.

**Untyped data (API responses, JSON.parse, dynamic keys)** — don't reach for `as`. Reach for `R.pathOr`/`R.defaultTo` with a typed default, or `R.objOf`/`R.project` where the shape is known:

```ts
const name: string = R.pathOr('', ['user', 'profile', 'name'], data);
const safe = R.defaultTo({ items: [] } as Item[], payload.items);  // annotate the default, not a cast on the pipeline
```

## What to say in a review

When you see any of these in a review, name the fix explicitly:

| Symptom | Diagnosis | Fix |
|---|---|---|
| `const l = R.lensProp(...)` then errors at `R.view(l, …)` | Lens inferred `never` | Inline, or `R.lensProp<ObjType, 'k'>('k')` (S first) |
| `R.cond([...])` typing as `never`/`any` | Missing generics | `R.cond<[T], R>(...)` — T is the argument tuple |
| `R.either(f, g)` "Expected 1 type args, got 2" / preds any | Wrong arity / mismatched pred sigs | `R.either<T>(f, g)` with matching signatures |
| `as any` / `as unknown` in a pipeline | Type got lost somewhere | Find the losing seam (usually a hoisted lens/cond or a `path` on dynamic keys); fix there |
| `R.sortBy(R.ascending, ...)` | `ascending` doesn't exist | `R.sortBy(R.prop('k'), list)` or `R.sortWith([R.ascend(...), R.descend(...)], list)` |

## Version note

These behaviors are for `types-ramda 0.32.x`. The typings are a heavily-engineered layer over `ts-toolbelt`; if the user's `@types/ramda` differs (older/latest), the trap list may shift. Flag when it matters.
