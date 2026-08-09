# Imperative → Ramda conversion patterns

The conversion skill is about matching **shapes**, not lines. Each imperative construct below maps to a Ramda shape. Every pattern shows the *shape* of the before and after so you can apply it to any instance.

Use these in Convert mode. For each conversion: show original → Ramda → a sentence on the key transformation and any argument-order trap you avoided.

---

## 1. Loop that builds a new array → `R.map`

```ts
// Before
const result: number[] = [];
for (const x of nums) result.push(x * 2);

// After
const result = R.map((x: number) => x * 2, nums);
```

The loop *constructs* a list by transforming each element — that's exactly `map`'s contract. `map` also signals intent (transform) where the loop is silent.

## 2. Loop with a condition → `R.filter` + `R.map` (or `R.chain`)

```ts
// Before
const result = [];
for (const x of nums) if (x > 0) result.push(String(x));

// After
const result = R.pipe(
  R.filter((x: number) => x > 0),
  R.map(String),
)(nums);
```

`filter` then `map`. If the condition and transform fuse (`if (cond(x)) push(f(x))` where the predicate inspects the *transformed* value), use `R.chain`:

```ts
const result = R.chain((x: number) => x > 0 ? [String(x)] : [], nums);
```

## 3. Splitting a list by a predicate → `R.partition`

```ts
// Before
const evens = [], odds = [];
for (const x of nums) (x % 2 === 0 ? evens : odds).push(x);

// After
const [evens, odds] = R.partition((x: number) => x % 2 === 0, nums);
```

Destructuring a tuple out of `partition` replaces the two accumulating arrays and the ternary side-effect in one go. Note it returns `[pass, fail]`.

## 4. `if/else if/else` chain → `R.cond` (or `when`/`unless` for single branches)

```ts
// Before
let grade;
if (score > 90) grade = 'A';
else if (score > 80) grade = 'B';
else grade = 'C';

// After (TS: always give <T, R>; T is the argument tuple on types-ramda 0.32)
const grade = R.cond<[number], string>([
  [R.gt(R.__, 90), R.always('A')],
  [R.gt(R.__, 80), R.always('B')],
  [R.T, R.always('C')],
])(score);
```

Single condition:
```ts
// if (x > 10) return x * 2; else return x;
R.when(R.gt(R.__, 10), R.multiply(2))(x);
// if (!(x > 10)) return -x; else return x;
R.unless(R.gt(R.__, 10), R.negate)(x);
```

## 5. Null-guard → `R.defaultTo` / `R.pathOr` / `R.propOr`

```ts
// Before
const name = user && user.name ? user.name : 'anonymous';

// After
const name = R.defaultTo('anonymous', user?.name);
```

Nested null-guards are where `pathOr` shines — it short-circuits the whole chain:

```ts
// Before
const city = obj.a && obj.a.b ? obj.a.b.city : 'nowhere';
// After
const city = R.pathOr('nowhere', ['a', 'b', 'city'], obj);
```

## 6. Accumulator loop → `R.reduce` (but prefer `map`/`filter` when intent is transform)

```ts
// Before
let total = 0;
for (const x of nums) total += x;

// After
const total = R.reduce((acc: number, x: number) => acc + x, 0, nums);
// …or just R.sum(nums) for this exact case.
```

**The smell check**: if your reduce *builds a list*, you likely want `map`/`filter`/`chain` instead. `reduce` should only appear for genuinely non-trivial accumulation (grouping, running state, early-exit via `R.reduceWhile`).

## 7. Nested object assignment → `R.assocPath` / `R.modify` / `R.evolve`

```ts
// Before
const copy = { ...user, address: { ...user.address, city: 'Paris' } };

// After
const copy = R.assocPath(['address', 'city'], 'Paris', user);
```

For several independent updates in one pass, `evolve` reads better and types better:

```ts
// Before
const u2 = { ...u, age: u.age + 1, address: { ...u.address, zip: '75000' } };
// After
const u2 = R.evolve({ age: R.inc, address: { zip: R.always('75000') } }, u);
```

`evolve` recursively matches nested objects/arrays, never mutates, and its output type follows the transform map. When the transformation depends on the *current value*, `over` + a lens is the tool (see patterns 9/10).

## 8. Side effect inside a pipeline → `R.tap`

```ts
// Before (imperative interleaving)
const processed = nums.map(x => { console.log(x); return x * 2; });

// After
const processed = R.pipe(R.tap(console.log), R.map(R.multiply(2)))(nums);
```

`tap(fn)` runs `fn` on the value and passes the value through untouched. Type-safe, explicit, and the side effect no longer hides inside the transform.

## 9. Get/set/transform a nested path as a reusable value → lens

Use a lens when the *same path* is read/written across several places, or when you want to transform "whatever is at this path" generically:

```ts
const userLens = R.lensProp<User, 'age'>('age');  // S (object) first, then K (key)
const currentAge = R.view(userLens, user);
const older     = R.over(userLens, R.inc, user);
const reset     = R.set(userLens, 0, user);
```

**TS rule**: if the lens is hoisted, give explicit generics (`R.lensProp<User, 'age'>('age')` — **object type S first, then key K**); if used inline, `R.set(R.lensProp('age'), 0, user)` infers on its own.

## 10. Building a shape from multiple computations → `R.applySpec`

```ts
// Before
const summary = { total: R.sum(items), count: items.length, first: items[0] };

// After
const summarize = R.applySpec<Summary>({
  total: R.sum,
  count: R.length,
  first: R.head,
});
const summary = summarize(items);
```

`applySpec` turns an object of functions into one function that returns an object of results. Great for API-response shaping and for moving ad-hoc object literals into named, testable transformers. Annotate the output type `R.applySpec<Summary>(...)`.

## 11. Early exit in a loop → `R.reduceWhile`

```ts
// Before
let acc = 0;
for (const x of nums) {
  if (acc + x > 100) break;
  acc += x;
}

// After
const acc = R.reduceWhile<number, number>(
  (a, x) => a + x <= 100,  // continue-while
  (a, x) => a + x,
  0,
  nums,
);
```

## 12. Single-value dispatch → `R.applyTo`

```ts
// Before
const result = fn(data);
// After
const result = R.applyTo(data)(fn);
```

Mostly useful for slotting into a pipeline when the function comes late; don't reach for it otherwise.

## 13. Multiple branches returning from one input → `R.juxt`

```ts
const parts = R.juxt([R.head, R.init, R.tail])(list);
// [head, init, tail]
```

`juxt` runs several functions on the same value and collects the results. Complements `applySpec` (object output) with array output.

---

## Order of attack

When converting a non-trivial function, work in this order:

1. **Slice the data flow** — find the input collection(s) and the output shape.
2. **Rewrite the innermost operation first** (the leaf transforms/conditions).
3. **Compose outward** — wrap leaves in `pipe`, then add guards (`defaultTo`/`when`) at the boundaries.
4. **Type-check** — run tsc; fix any seam that lost its type using `references/typescript.md`.
5. **Read it back** — if the result is harder to follow than the original, pull the complex leaf into a named helper and keep the `pipe` shallow.

## When NOT to convert

- The loop has **non-trivial control flow** (early `return` of a different shape, `continue` that skips but also mutates external state). `reduceWhile` covers some of it, but a loop is honest there.
- **Readability** suffers. Point-free is a means, not an end; a readable `for` beats an unreadable `pipe` every time.
- The code is **perf-critical** and the data is huge: `map`/`filter` chains allocate intermediate arrays. Ramda is correct-first; if the benchmark says otherwise, keep the loop *and say so*.
