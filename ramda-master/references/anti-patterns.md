# Ramda anti-patterns — the verified trap list

Every item here was tested against **Ramda 0.32.0**. These are the mistakes intermediate developers actually make — wrong argument orders, functions that don't exist, mutation bugs, and perf traps. When reviewing code, walk this list.

---

## A. Wrong argument order (the #1 category)

Ramda's convention is **value/key/data-last**, which trips people coming from lodash or native JS. These were all verified:

| Intuition (WRONG) | Actual (RIGHT) |
|---|---|
| `R.propEq('age', 30, obj)` — key then value | `R.propEq(30, 'age', obj)` — **value then key** |
| `R.pathEq(['a','b'], 1, obj)` — path then value | `R.pathEq(1, ['a','b'], obj)` — **value then path** |
| `R.adjust(fn, 1, list)` — fn then index | `R.adjust(1, fn, list)` — **index first** |
| `R.update(fn, 1, list)` | `R.update(1, value, list)` — **index first** |
| `R.subtract(5, x)` thinking "5 minus" | `R.subtract(a, b) = a − b`. With curry: `R.subtract(5)` means `x − 5`. To express `5 − x`, put the placeholder first: `R.subtract(R.__, 5)`. |
| `R.gt(18, x)` thinking "x > 18" | `R.gt(a, b) = a > b`, so `R.gt(R.__, 18)` = `x > 18` |

The `subtract`/`divide`/`gt` family with `R.__` is where confusion peaks. Table of intent → call:

| You want | Write |
|---|---|
| `x − 5` | `R.subtract(R.__, 5)` |
| `5 − x` | `R.subtract(5)` |
| `x / 2` | `R.divide(R.__, 2)` |
| `2 / x` | `R.divide(2)` |
| `x > 18` | `R.gt(R.__, 18)` |
| `18 > x` (i.e. `x < 18`) | `R.gt(18)` (or `R.lt(R.__, 18)`) |

## B. Functions that don't exist

| You wrote | Reality |
|---|---|
| `R.ascending` / `R.descending` | **Do not exist.** The comparators are `R.ascend` / `R.descend`, used with `R.sortWith`. `R.sortBy` takes a plain key function, no wrapper at all. |
| `R.merge` | Exists but deprecated — in 0.32 `R.merge` is `mergeRight` (right wins). Prefer explicit `R.mergeRight` / `R.mergeLeft`. |
| `R.flatMap` | Doesn't exist; that's `R.chain`. |
| `R.tap(fn, list)` | `R.tap(fn)` returns a function; call it with the data: `R.tap(fn)(data)`. |

## C. Mutation bugs

Ramda functions never mutate — but only if you use *Ramda* functions. Common slips:

- `arr.sort()` **mutates in place** in native JS. Use `R.sort` / `R.sortBy` / `R.sortWith` (all return new arrays).
- `obj.x = y`, `arr.push()` inside a "functional" rewrite — defeat the point entirely. Replace with `assoc`/`append`/`concat`.
- **`R.evolve` deletes keys when a transformer returns `undefined`** — this is a feature, but surprising: `R.evolve({ a: () => undefined }, { a: 1, b: 2 })` → `{ b: 2 }`. Use `R.__` as the transformer to keep a key unchanged.
- `R.adjust` out-of-range index returns the **original** list unchanged — a silent no-op, not an error. If you expected a change, that's the bug.

## D. Misusing the composition primitives

- `R.pipe` vs `R.compose`: `pipe` is L→R (data flows left to right), `compose` is R→L. Mixing them without checking direction produces wrong results that *look* right.
- `R.o(f, g)` = `f(g(x))` — the first arg is the outer function. Easy to flip.
- **`R.converge` requires the branches to return exactly what the combiner accepts.** `R.converge(R.concat, [R.head, R.last])([1,2,3])` **throws** — the branches return numbers `1` and `3`, but `concat` wants lists. Correct: `R.converge(R.pair, [R.head, R.last])([1,2,3])` → `[1,3]` (pair takes two values), or wrap: `R.converge(R.concat, [x => [R.head(x)], x => [R.last(x)]])`. **The pattern: converge's combiner must accept exactly what its branch functions return.** Verify the types.
- `R.cond` with no matching branch returns `undefined` — it doesn't throw. If you rely on a final `R.T` branch (you should), you're safe.
- **`R.maxBy`/`R.minBy` are *binary comparators*, not "pick the max from a list".** `R.maxBy(fn, a, b)` returns the larger of *two values* — it can't be piped directly. To find the maximum element of a list by a projection, use `reduce` + `maxBy`, or a plain `reduce` with an explicit `>` — never `R.sortBy(fn)` + `R.last`, which sorts the whole list (O(n log n)) just to read one element.

## E. Performance traps

- **Chained `map`/`filter`/`reduce` allocate intermediate arrays.** For huge lists this is real garbage. Options: (1) accept it — correctness first, (2) `R.into` / `R.transduce` to fuse, (3) keep the loop and document why. Don't pretend `map`+`filter`+`reduce` is free.
- `R.clone` is deep and slow — avoid unless you actually need deep structural cloning.
- `R.pick`/`R.pickAll` on hot paths with huge objects — building the new object costs; fine for normal sizes.

## F. Type traps (summary — full detail in typescript.md)

- `R.lensProp('age')` hoisted to a const → `Lens<unknown, never>`. Inline it or give `lensProp<ObjType, 'age'>('age')` — **object type S first, then key K** (see typescript.md Trap 1).
- `R.cond([...])` without `<T, R>` → `never`/`any` inputs.
- `R.either(f, g)` with two type args → error; with mismatched predicate signatures → `any`.
- `R.path(pathArray, obj)` on **dynamic** keys returns `unknown` → use `R.pathOr(default, path, obj)`.

## G. Style smells

- **`R.reduce` to build a list** when `map`/`filter`/`chain` express the intent — readability loss for nothing.
- **Overly long `pipe` chains** (8+ stages) — split the complex middle into named helpers.
- **Point-free for its own sake** — `R.compose(R.add(1), R.multiply(2))` is fine, but if a named `const doubleThenAdd = (x) => x * 2 + 1` reads better, use that. This is a judgment call, not a rule.
- **`R.prop` chains**: `R.prop('a')(R.prop('b')(obj))` should be `R.path(['a','b'], obj)`.
- **Ramda where native JS is better** — the "is this worth it" smell. Ramda earns its place when it removes real ceremony (pipelining, immutable nested updates, data-last composition); it doesn't when it merely renames a native operator. Flag when: a static-path `pathOr`/`propOr` that `?.`/`??` expresses as `obj?.a?.b ?? d`; a one-off `sort` on a copy where `toSorted()` reads naturally; `R.isEmpty` where `x === ''` is clearer; a `pipe` wrapping a single transform. The usage tiers in `functions.md` exist to encode this judgment — reaching for 🟡/🔴 where a 🟢 Core function or native JS suffices is a smell. The correct review call is often **"don't use Ramda here"**.

---

## Quick review triage

Order the review by impact:

1. **Argument order** (A) — most common, silently wrong results.
2. **Nonexistent functions** (B) — hard runtime errors.
3. **Mutation** (C) — defeats the entire purpose, subtle shared-state bugs.
4. **Composition direction** (D) — wrong-but-valid output.
5. **Types** (F) — compile errors or `as any` smell.
6. **Perf/style** (E/G) — softer, flag with alternatives, don't dogmatize. Includes **"don't use Ramda here"** when native JS is genuinely clearer.
