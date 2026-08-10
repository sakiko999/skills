# Ramda Function Dictionary (task-indexed)

Verified against **Ramda 0.32.0**. Indexed by task because that's how you'll think about it. Every signature here was executed to confirm. `R.__` means the Ramda placeholder — it fills a gap in curried args.

Signature conventions below: `→` separates curried argument groups. Argument **order is authoritative** — Ramda frequently puts the "expected value" *before* the key/path (see anti-patterns.md).

---

## Usage tiers — which functions you'll actually reach for

Ramda exports **272 functions**; in a normal TypeScript project you'll *daily* use roughly **25–35**. The rest are situational or effectively dead. Tier everything by "will an intermediate TS dev actually use this on a typical task?" — not by whether the function exists.

| Tier | Meaning | Count | Examples |
|---|---|---|---|
| 🟢 **Core** | Daily drivers. Know these cold — they're your rewrite vocabulary. | ~30 | `pipe`, `map`, `filter`, `reduce`, `chain`, `assoc`, `assocPath`, `evolve`, `pick`, `omit`, `mergeRight`, `mergeLeft`, `when`, `unless`, `ifElse`, `cond`, `defaultTo`, `sortBy`, `sortWith`, `groupBy`, `uniqBy`, `find`, `pluck`, `propEq`, `where`, `isNil`, `R.__` |
| 🟡 **Situational** | Elegant when the fit is right, but you'll reach for them only on specific shapes. Know they exist and what they're for; look up the signature. | ~25 | `lens`/`view`/`set`/`over`, `applySpec`, `juxt`, `converge`, `scan`, `reduceWhile`, `tap`, `tryCatch`, `clamp`, `range`, `times`, `zip`, `aperture`, `mapObjIndexed`, `groupWith`, `countBy`, `mergeDeepRight` |
| 🔴 **Rare / skip** | Exist for completeness or advanced FP. Note them, don't memorize. | the rest | `transduce`/`into`, `lensIndex`/`lensPath` deep cases, `unfold`, `xprod`, `unwind`, `rebuild`, `collectBy`, `ap`/`lift`/`sequence`/`traverse` (Fantasy Land), `construct`/`invoker`/`memoizeWith` edge cases |

**The decision heuristic**: ask *"does the native language / a cleaner Ramda shape already express this with less ceremony?"* If yes → it's not core (see the `pathOr` vs optional-chaining callout below). A function is only **core** when Ramda's version is genuinely better than what TS+JS give you natively.

### `pathOr` / `propOr` vs optional chaining (`?.` + `??`) — a tiering example

These overlap with native JS. Use the native form for the common static case; reach for `pathOr`/`propOr` only when it pays:

| Scenario | Preferred | Why |
|---|---|---|
| Static path: `obj?.a?.b ?? 'x'` | **Native** | Readable, no import. `pathOr('x', ['a','b'], obj)` is ceremony for nothing. |
| Handle `NaN` as missing | **`defaultTo`/`pathOr`** | `??` does **not** treat `NaN` as nullish; `defaultTo('x', NaN)` → `'x'`. (Both keep `0`/`''`/`false`.) |
| Dynamic path array: `const keys = [...]; pathOr('x', keys, obj)` | **`pathOr`** | Optional chaining cannot take a path variable. |
| Reuse inside a pipeline: `R.pipe(R.pathOr('x', ['a','b']), R.toUpper)` | **`pathOr`** | Pre-build the accessor; `?.` can't be partially applied. |

Bottom line: `pathOr`/`propOr`/`defaultTo` are **Core**, but *only for the NaN / dynamic-path / pipeline-reuse cases*. If the user just needs `a?.b?.c ?? d`, write the native expression — Ramda buys nothing.

---

## Transform lists

| Task | Function | Signature |
|---|---|---|
| Apply fn to every element | 🟢 `R.map` | `(fn) → (list) → list` |
| Keep elements matching pred | 🟢 `R.filter` | `(pred) → (list) → list` |
| Drop elements matching pred | 🟢 `R.reject` | `(pred) → (list) → list` (inverse of filter) |
| Split list by predicate | 🟢 `R.partition` | `(pred, list) → [yes, no]` |
| Map + flatten one level | 🟢 `R.chain` | `(fnReturningList) → (list) → list` (flatMap) |
| Extract one prop from each | 🟢 `R.pluck` | `(key, list) → list` — missing keys yield `undefined` |
| Project columns from rows | 🟡 `R.project` | `(keys, listOfObjects) → listOfObjects` |
| Run list as fn args | 🟢 `R.apply` | `(fn, argArray) → fn(...args)` |
| Keep duplicates out | 🟡 `R.uniq` / `R.uniqBy(keyFn)` | `(list) → list` / `(keyFn, list) → list` |

## Aggregate / reduce

| Task | Function | Signature |
|---|---|---|
| Fold left | 🟢 `R.reduce` | `(fn(acc, x), init, list) → acc` |
| Fold with early exit | 🟡 `R.reduceWhile` | `(pred, fn, init, list) → acc` |
| Fold, keep all intermediate accs | 🟡 `R.scan` | `(fn, init, list) → [init, acc1, acc2, …]` |
| Sum / product | 🟢 `R.sum` / `R.product` | `(list) → number` |
| Average / middle value | 🟢 `R.mean` / `R.median` | `(list) → number` |

## Query lists

| Task | Function | Signature |
|---|---|---|
| First match | 🟢 `R.find` | `(pred, list) → element \| undefined` |
| First matching index | 🟢 `R.findIndex` | `(pred, list) → number` (else -1) |
| Last match | 🟢 `R.findLast` | `(pred, list) → element \| undefined` |
| Any / all match | 🟢 `R.any` / `R.all` | `(pred, list) → boolean` |
| None match | 🟢 `R.none` | `(pred, list) → boolean` |
| Is element in list | 🟢 `R.includes` | `(element, list) → boolean` |

## Slice / shape lists

| Task | Function | Signature |
|---|---|---|
| First / last N | 🟡 `R.take` / `R.takeLast` | `(n, list) → list` |
| Drop first / last N | 🟡 `R.drop` / `R.dropLast` | `(n, list) → list` |
| Take/drop while pred holds | 🟡 `R.takeWhile` / `R.dropWhile` | `(pred, list) → list` |
| Split at index / every N | 🟡 `R.splitAt` / `R.splitEvery` | `(n, list) → [a, b]` / `(n, list) → [chunks]` |
| Sliding window | 🟡 `R.aperture` | `(n, list) → [[…n], […n], …]` |
| Remove N from index | 🟡 `R.remove` | `(idx, count, list) → list` |
| Insert element | 🟡 `R.insert` / `R.insertAll` | `(idx, el, list) → list` |
| Add to end / front | 🟡 `R.append` / `R.prepend` | `(el, list) → list` |
| Replace element at index | 🟡 `R.adjust` | `(idx, fn, list) → list` — **index FIRST** |
| Replace element at index (value) | 🟡 `R.update` | `(idx, value, list) → list` — **index FIRST** |
| Concat two lists | 🟡 `R.concat` | `(listA, listB) → list` |
| Zip lists into pairs | 🟡 `R.zip` | `(listA, listB) → [[a,b], …]` |
| Cartesian product | 🔴 `R.xprod` | `(listA, listB) → [[a,b], …]` |

## Group / index / count

| Task | Function | Signature |
|---|---|---|
| Group by key fn (→ object) | 🟢 `R.groupBy` | `(keyFn, list) → { key: items[] }` |
| Group by key fn (→ list) | 🟡 `R.collectBy` | `(keyFn, list) → [groups]` (0.32+) |
| Count by key fn | 🟢 `R.countBy` | `(keyFn, list) → { key: count }` |
| Build key→item index (last wins) | 🟢 `R.indexBy` | `(keyFn, list) → { key: item }` |
| Group *adjacent* equals | 🟡 `R.groupWith` | `(eqFn, list) → [groups]` |
| Count elements matching pred | 🟢 `R.count` | `(pred, list) → number` (0.32+) |

## Sort

| Task | Function | Signature |
|---|---|---|
| Sort by key function (ascending) | 🟢 `R.sortBy` | `(keyFn, list) → list` — keyFn returns a comparable, e.g. `R.prop('age')`. **No comparator wrapper.** |
| Sort with comparator | 🟢 `R.sort` | `((a,b) → number, list) → list` |
| Multi-key sort | 🟢 `R.sortWith` | `(comparatorList, list) → list` — comparators are `R.ascend(fn)` / `R.descend(fn)` |
| Ascending comparator | 🟢 `R.ascend` | `(keyFn) → (a,b) → number` — for `sortWith`/`sort`. **NOT `ascending`. `R.ascending` does not exist.** |
| Descending comparator | 🟢 `R.descend` | `(keyFn) → (a,b) → number` — **NOT `descending`.** |

`R.ascend`/`R.descend` **do not exist**. Use `ascend`/`descend`. This is the single most-confused Ramda API.

## Read objects

| Task | Function | Signature |
|---|---|---|
| Read a prop | 🟢 `R.prop` | `(key, obj) → value` |
| Read nested path | 🟢 `R.path` | `([k1, k2, …], obj) → value` |
| Read prop with default | 🟢 `R.propOr` | `(default, key, obj) → value` |
| Read path with default | 🟢 `R.pathOr` | `(default, [path], obj) → value` |
| Read several props | 🟢 `R.props` | `(keys, obj) → [values]` |
| All keys / values | 🟢 `R.keys` / `R.values` | `(obj) → string[]` / `(obj) → any[]` |
| Pair list / object | 🟢 `R.toPairs` / `R.fromPairs` | `(obj) → [[k,v],…]` / `([[k,v],…]) → obj` |

## Update objects (immutably — original is never touched)

| Task | Function | Signature |
|---|---|---|
| Set a prop | 🟢 `R.assoc` | `(key, value, obj) → newObj` — type-preserving |
| Set a nested path | 🟢 `R.assocPath` | `([path], value, obj) → newObj` |
| Remove a prop | 🟢 `R.dissoc` | `(key, obj) → newObj` |
| Remove a nested path | 🟢 `R.dissocPath` | `([path], obj) → newObj` |
| Transform a prop | 🟢 `R.modify` | `(key, fn, obj) → newObj` |
| Transform a nested path | 🟢 `R.modifyPath` | `([path], fn, obj) → newObj` |
| Keep only listed keys | 🟢 `R.pick` / `R.pickAll` | `(keys, obj) → obj` (pickAll keeps `undefined` for missing) |
| Keep keys by predicate | 🟢 `R.pickBy` | `((val, key) → bool, obj) → obj` |
| Drop listed keys | 🟢 `R.omit` | `(keys, obj) → obj` |

## Deep transform / merge

| Task | Function | Signature |
|---|---|---|
| Recursive transform by shape | 🟢 `R.evolve` | `(transformers, obj) → newObj` — matches nested objects and arrays; `R.__` value leaves a key unchanged; a transformer returning `undefined` **deletes** the key |
| Merge right-wins | 🟢 `R.mergeRight` | `(objA, objB) → objB's values override` (this is `R.merge`'s behavior) |
| Merge left-wins | 🟢 `R.mergeLeft` | `(objA, objB) → objA's values override` |
| Merge all | 🟢 `R.mergeAll` | `(objs) → merged` |
| Deep merge right-wins | 🟢 `R.mergeDeepRight` | `(a, b) → deep, b wins` |
| Deep merge left-wins | 🟢 `R.mergeDeepLeft` | `(a, b) → deep, a wins` |

## Predicates & guards

| Task | Function | Signature |
|---|---|---|
| Compose preds (all) | 🟢 `R.allPass` | `(preds, …args) → boolean` |
| Compose preds (any) | 🟢 `R.anyPass` | `(preds, …args) → boolean` |
| Both preds | 🟢 `R.both` | `(pred1, pred2) → pred` |
| Either pred | 🟢 `R.either` | `(pred1, pred2) → pred` |
| Negate a pred | 🟢 `R.complement` | `(pred) → pred` |
| Object matches shape | 🟢 `R.where` | `({ key: pred }, obj) → boolean` |
| Object matches any | 🟢 `R.whereAny` | `({ key: pred }, obj) → boolean` |
| Object has exact values | 🟢 `R.whereEq` | `({ key: value }, obj) → boolean` |
| Prop equals value | 🟢 `R.propEq` | `(value, key, obj) → boolean` — **value FIRST, then key** |
| Prop satisfies pred | 🟢 `R.propSatisfies` | `(pred, key, obj) → boolean` |
| Path equals value | 🟢 `R.pathEq` | `(value, [path], obj) → boolean` — **value FIRST, then path** |
| Null / not-null | 🟢 `R.isNil` / `R.isNotNil` | `(x) → boolean` |
| is-array / string etc. | 🟢 `R.is` | `(Constructor, x) → boolean` e.g. `R.is(Number, 5)` |
| Loose equal / strict identical | 🟢 `R.equals` / `R.identical` | `(a, b) → boolean` |

## Control flow

| Task | Function | Signature |
|---|---|---|
| Default for nullish | 🟢 `R.defaultTo` | `(default, x) → default \| x` (only for `null`/`undefined`/`NaN`) |
| If-then-else | 🟢 `R.ifElse` | `(pred, onTrue, onFalse) → fn` |
| When pred holds | 🟢 `R.when` | `(pred, fn) → fn` (else passthrough) |
| Unless pred holds | 🟢 `R.unless` | `(pred, fn) → fn` |
| Multi-branch | 🟢 `R.cond` | `([[pred, fn], …]) → fn` — TS: needs explicit `<T, R>` generics |
| Fallback chain of fns | 🟡 `R.tryCatch` | `(fn, onError) → fn` |
| Run fn on data, return data | 🟢 `R.tap` | `(fn) → fn` (side effects in pipelines) |

## Compose / pipeline

| Task | Function | Signature |
|---|---|---|
| Left→right composition | 🟢 `R.pipe` | `(fn1, fn2, …) → fn` — data flows L→R |
| Right→left composition | 🟢 `R.compose` | `(fn1, fn2, …) → fn` — last fn runs first |
| Two-fn compose | 🟢 `R.o` | `(f, g) → fn` = `f(g(x))` |
| Apply many fns, collect | 🟡 `R.juxt` | `([fn1, fn2, …]) → fn → [r1, r2, …]` |
| Split then recombine | 🟡 `R.converge` | `(combiner, [branchFns]) → fn` — branches' results become the combiner's args: `R.converge(R.pair, [R.head, R.last])([1,2,3])` → `[1,3]` |
| Object of fns → one fn | 🟡 `R.applySpec` | `({ key: fn }, …args) → { key: result }` |
| Feed single value to fn | 🟡 `R.applyTo` | `(value) → (fn) → fn(value)` (reverse of direct call) |
| Custom pipe control | 🟡 `R.pipeWith` / `R.composeWith` | `((fn, value) → value, fns) → fn` |

## Set operations

| Task | Function | Signature |
|---|---|---|
| Merge (dedupe union) | 🟡 `R.union` | `(a, b) → list` |
| Common elements | 🟡 `R.intersection` | `(a, b) → list` |
| In a not in b | 🟡 `R.difference` | `(a, b) → list` |
| Remove elements | 🟡 `R.without` | `(toRemove, list) → list` |

## Numbers & strings

| Task | Function | Signature |
|---|---|---|
| Add / subtract / multiply / divide | 🟢 `R.add` / `R.subtract` / `R.multiply` / `R.divide` | `(a, b) → number`. `subtract(a, b) = a - b`, `divide(a, b) = a / b` |
| Increment / decrement / negate | 🟢 `R.inc` / `R.dec` / `R.negate` | `(x) → x±1` / `-x` |
| Clamp to range | 🟢 `R.clamp` | `(min, max, x) → x` |
| Max / min (curried compare) | 🟢 `R.max` / `R.min` | `(a, b) → bigger/smaller` |
| Comparisons | 🟢 `R.gt` / `R.gte` / `R.lt` / `R.lte` | `(a, b) → boolean`. Pair with `R.__`: `R.gt(R.__, 18)` = "x > 18" |
| Math reduce | 🟢 `R.mathMod` | `(m, x) → x mod m` |
| Uppercase / lowercase | 🟢 `R.toUpper` / `R.toLower` | `(str) → str` |
| Split / join | 🟢 `R.split` / `R.join` | `(sep, str) → list` / `(sep, list) → str` |
| Replace (regex) | 🟢 `R.replace` | `(re, replacement, str) → str` |
| Trim | 🟢 `R.trim` | `(str) → str` |
| Regex test / match | 🟢 `R.test` / `R.match` | `(re, str) → boolean` / `(re, str) → matches[]` |
| Slice string | 🟢 `R.slice` | `(start, end, strOrList) → …` |

## Lenses (for a reusable getter+setter over a path)

| Task | Function | Signature |
|---|---|---|
| Lens on a prop | 🟡 `R.lensProp` | `(key) → Lens` — **TS trap**: infers `never` when hoisted to a const; inline it or give `R.lensProp<ObjType, 'key'>('key')` (object type FIRST, then key) |
| Lens on nested path | 🟡 `R.lensPath` | `([path]) → Lens` |
| Lens on array index | 🟡 `R.lensIndex` | `(idx) → Lens` |
| Read through lens | 🟡 `R.view` | `(lens, obj) → value` |
| Write through lens | 🟡 `R.set` | `(lens, value, obj) → newObj` |
| Transform through lens | 🟡 `R.over` | `(lens, fn, obj) → newObj` |
| Build custom lens | 🟡 `R.lens` | `(getter, setter) → Lens` |

## Misc

| Task | Function | Signature |
|---|---|---|
| Generate number range | 🟢 `R.range` | `(start, endExclusive) → [start..end-1]` |
| Call fn N times | 🟢 `R.times` | `(fn, n) → [results]` |
| Unfold (generate from seed) | 🟡 `R.unfold` | `((seed) → [value, next] \| false, seed) → list` |
| Identity / always | 🟢 `R.identity` / `R.always` | `(x) → x` / `(value) → () → value` |
| Run fn once | 🟡 `R.once` | `(fn) → fn` (caches first result) |
| Memoize | 🟡 `R.memoizeWith` | `(keyFn, fn) → fn` |
| Constrain arity | 🟡 `R.nAry` / `R.unary` / `R.binary` | `(n, fn) → fn` |
| Flip arg order | 🟡 `R.flip` | `(fn) → fn` |
| Empty values | 🟡 `R.isEmpty` | `(x) → boolean` |
| Pick first/last | 🟢 `R.head` / `R.last` | `(list) → element` |
| Everything but last/first | 🟢 `R.init` / `R.tail` | `(list) → list` |
| Nth element | 🟢 `R.nth` | `(idx, list) → element` |
