---
name: ramda-master
description: Master Ramda for TypeScript. Use whenever the user writes or refactors code with the Ramda functional library, asks to convert imperative JavaScript/TypeScript into point-free functional style, needs a Ramda function recommendation for a specific task, wants a Ramda concept explained, or hits TypeScript type-inference problems with @types/ramda (lensProp/cond/either inferring as never, propEq argument order, curry signatures). Also triggers on "Ramda", "functional programming", "point-free", "compose/pipe", or when converting lodash/imperative code. Make sure to use this skill whenever Ramda is mentioned even implicitly — e.g. users asking to "make this more functional" or to refactor an array-processing loop — not just when they explicitly say "Ramda".
---

# Ramda Master

A working reference for writing correct, idiomatic, **type-safe** Ramda in TypeScript. Built for developers who already know JavaScript and functional basics but keep tripping over Ramda's specific design and `@types/ramda`'s inference quirks.

The value of this skill is threefold: (1) an accurate mental model of how Ramda differs from lodash/native JS, (2) precise, *verified* function signatures — argument order in Ramda is frequently the opposite of intuition, and (3) TypeScript patterns that keep types intact through currying and composition.

## The goal — code that reads clearly

**Why this skill exists:** conventional imperative code is often *structurally bloated and semantically opaque* — the reader has to hold a mental stack of temporary variables, mutation order, and nesting levels to see what a block actually does. The point of functional programming here is **readability**: to make *intent* obvious at the surface instead of buried in mechanics.

So the skill's north star is not "more point-free", "more Ramda", or "all loops eliminated". It is:

> **Does the resulting code read better than the imperative original — clearer intent, less structural noise?**

Every decision in this skill — which function to pick, whether to convert at all, how far to take point-free — is judged against that question. A rewrite that is *more* convoluted than the original has failed, regardless of how "pure" it is. When the Ramda version and the imperative version are equally clear, prefer the one that is more **semantically explicit**: a `pipe` of `filter`→`map` states intent ("select then transform") where a `for` loop only states mechanics. That is what the skill optimizes for.

In practice this means: **favor code whose top-level reading expresses the transformation, not the iteration.** Prefer `R.pipe(R.filter(isAdult), R.map(name))` over the equivalent `for` loop — not because loops are bad, but because the pipeline's shape *is* the meaning. And equally: never contort Ramda into something harder to read than the plain JS it replaces.

## The mental model — three things that make Ramda Ramda

Everything else in this skill flows from these. Internalize them and most "why is this broken" questions answer themselves.

1. **Data-last, data-final.** The collection/object you operate on is *always* the last argument: `R.map(fn, list)`, `R.filter(pred, list)`. Functions are curried, so `R.map(fn)` alone returns a reusable transformer. This is the opposite of lodash's data-first order and is the #1 source of "wrong argument" bugs.

2. **Everything is curried automatically.** Every multi-arg function is curried: `R.add(1)` is a function. This enables pipelines (`R.pipe(...)`) where data flows through pre-applied transforms. `R.__` (the placeholder) fills *any* gap: `R.subtract(R.__, 5)` means "5 minus whatever comes later".

3. **Nothing mutates its input.** Ramda functions return new structures. `R.assoc('b', 2, obj)` returns a *new* object; `obj` is untouched. This is what makes point-free pipelines safe to reuse.

**Why this matters for the reader:** Ramda's ergonomics are built on these three facts working *together*. If any one breaks (you pass data first, you call an uncurried function with one arg, you mutate), the code stops being Ramda and starts being buggy JavaScript.

## Working with TypeScript — do this first, always

The user's project is TypeScript, and `@types/ramda` (which re-exports `types-ramda`) does type-safety well *when you use it correctly*, and fails silently *when you don't*. Before writing any Ramda code, check the target: is it a curried pipeline, a lens, a cond, or a plain function call? Each has its own typing pattern (see `references/typescript.md`). The two rules that prevent the most pain:

- **Prefer inlining.** When a `Lens` or `cond` is used once, write it inline in the call site (`R.set(R.lensProp('age'), 99, user)`) so TS infers the `S` type from the surrounding object. Hoisting it to a `const` **destroys the type** — `const l = R.lensProp('age')` infers `Lens<unknown, never>` and downstream `view`/`set` calls become type errors.
- **Annotate where inference can't.** `R.cond(...)` and `R.either(...)` can't infer their input/output types from the predicate bodies alone — give explicit generics: `R.cond<[number], string>([...])` (T is the *argument tuple* on types-ramda 0.32 — see `references/typescript.md`), `R.either<Person>(p => ..., p => ...)`.

Always verify the resulting type is what you expect — especially after `assoc`/`evolve`/`pipe` — and prefer explicit type annotations over `as` casts. See `references/typescript.md` for the full trap list with fixed patterns.

## Choose your mode

The skill has four modes. Match the user's request to one (or compose several):

| Mode | Trigger phrases | Where the logic lives |
|---|---|---|
| Explain | "how does X work", "why is X like this", "explain lens" | `references/concepts.md` |
| Convert | "rewrite this in Ramda", "make this functional", "refactor this loop" | `references/patterns.md` |
| Review | "is this idiomatic Ramda", "review my Ramda code", "is this right" | `references/anti-patterns.md` |
| Recommend | "which Ramda function for X", "how do I group these" | `references/functions.md` |

If unsure which mode, default to **Convert + Review**: show the rewritten code *and* explain what changed and why. Intermediate developers learn most from seeing their own imperative code transformed.

## Convert — imperative → Ramda, a repeatable recipe

Do not translate line-by-line. Translate *shapes*: each imperative pattern maps to a Ramda shape. Read `references/patterns.md` for the full pattern library; the recipe is:

1. **Identify the collection operation** — a `for`/`forEach` becomes `map` (transform), `filter`/`reject` (select), `reduce` (accumulate), `partition` (split), `find`/`some`/`every` (query).
2. **Identify the branching** — `if/else if/else` chains become `when`/`unless`/`ifElse`/`cond`. Recurring null-guards become `defaultTo`/`pathOr`/`propOr`.
3. **Identify nested mutation** — assignments into nested objects (`obj.a.b = x`) become `assoc`/`assocPath`/`modify`/`evolve`. Do not use `set`/`lens` here unless a lens already exists or is shared.
4. **Compose the pipeline** — wire the transforms with `pipe` (left→right, data flows naturally) or `compose` (right→left, reads like function nesting). Prefer `pipe` for readability.
5. **Preserve types** — after step 4, check that the pipeline's input and output types survived. If a step returned `unknown` or `never`, fix the annotation per `references/typescript.md`.
6. **Read it back** — if the Ramda version is *harder* to read than the original, keep the original or use a lighter touch. Point-free is a tool, not a goal.

**Write the output as:** original snippet → Ramda version → 2-4 sentences on the key transformations (especially argument-order traps you avoided). TypeScript annotations included.

## Review — the checklist

Walk the code against these. Each is a common failure mode with a specific fix (see `references/anti-patterns.md` for details):

1. **Data-last?** Every Ramda call passes the data as the *final* argument. `R.map(fn, list)` — if you see data first, it's a bug.
2. **Argument order of the "tricky" functions?** `propEq(val, key, obj)`, `pathEq(val, path, obj)`, `adjust(idx, fn, list)`, `subtract(a, b)` = `a - b`. Value-before-key is Ramda's (surprising) convention. `R.filter(R.propEq(2, 'id'), ...)` — value first.
3. **No mutation?** No `obj.x = y`, no `.push()`, no `arr.sort()` (it mutates in place!). Use `assoc`, `append`, `sort` (returns a copy).
4. **`sortBy` vs `sortWith`?** `R.sortBy(R.prop('age'), list)` — key function, automatic ascending. `R.sortWith([R.descend(R.prop('age')), R.ascend(R.prop('name'))], list)` — comparator *list*, needs `ascend`/`descend` (note: NOT `ascending`/`descending`). Do not pass `R.ascending` to `sortBy`.
5. **Placeholder used right?** `R.subtract(R.__, 5)` to subtract data from 5; `R.gt(R.__, 18)` for "x > 18".
6. **Type safety?** No `as any`, no `as unknown`. If types broke, fix with the patterns in `references/typescript.md`.
7. **Point-free overuse?** A `pipe` of 2-3 tiny lambdas where one `compose` with a named helper reads better is fine to *not* refactor. Suggest, don't dogmatize.
8. **Native-JS better than Ramda here?** Flag when plain TS/JS would be clearer than the Ramda being used — a static-path `pathOr` where `?.`/`??` suffices, a one-off `sort` where `toSorted` reads fine, `prop` on a non-curried context. The tiers in `references/functions.md` encode this: 🟢 Core functions earn their keep; if the code reaches for 🟡/🔴, verify the shape genuinely needs it. Saying "just use native here" is a correct review outcome.

## Explain — the teaching pattern

For a concept (lens, transduce, cond, `R.__`, curry, fantasy-land, …): use this structure — it matches how intermediate devs absorb new FP ideas.

1. **One-line positioning**: what problem it solves, in one sentence, in *their* domain ("lenses are getters+setters for a *path*, as a reusable value").
2. **Why Ramda built it this way**: the design rationale (e.g. lens enables `over` for traversals, composes with `compose`).
3. **A minimal example**, then a **realistic one** (a DOM update, an API response transform) with TypeScript types shown.
4. **When NOT to use it** — the honest trade-off. This builds credibility and prevents skill-misuse.

## Recommend — how to pick a function

For "which function…" questions, use `references/functions.md`. It is indexed by *task* (group by key, update nested field, split list, …) not by alphabet, because that's how people think. Give the top pick, one-line why, and one line showing the call. Mention the `R.__`/curry implication when relevant ("`R.groupBy(fn)` returns a function; call it with the list").

**Respect the usage tiers** (`references/functions.md`): prefer 🟢 Core functions in normal code. Use 🟡 Situational ones only when the shape genuinely fits (e.g. a lens for a path reused in several places). For 🔴 Rare ones, prefer *not* using Ramda at all — a native `for`/`reduce` or plain JS is usually clearer. Tiering is about *when to not use Ramda* as much as which function to pick.

**Check for native JS equivalents first.** If plain TS+JS already expresses something readably — optional chaining for a static path, `Array.prototype.filter`/`map` for a one-off transform, `??` for a nullish default — say so and write the native version. Ramda earns its place when it removes real ceremony (pipelining, immutability, data-last composition), not when it just renames a native operator. Only the NaN-as-missing, dynamic-path, and pipeline-reuse cases justify `pathOr`/`propOr`/`defaultTo` over `?.`/`??`.

## Universal rules

- **Never invent a signature.** Ramda has 272 exports; memory is wrong more often than right. Argument order is the most error-prone part. If a signature isn't in `references/functions.md` or `references/anti-patterns.md`, verify it against the source (type defs in `node_modules/types-ramda/es/index.d.ts`, or the `es/` source files) *before* writing it. The table in `references/anti-patterns.md` documents the traps this skill has already verified.
- **Never propose `R.ascending`/`R.descending`** — they don't exist; the comparators are `R.ascend`/`R.descend` (for `sortWith`), and `sortBy` takes a plain key function.
- **Never use `R.reduce` to do what `map`/`filter` do.** If you're accumulating a list, `reduce` is a smell; `map`/`filter`/`chain` communicate intent.
- **Prefer `pipe` over `compose`** for new code; both are fine, but `pipe` reads top-to-bottom and matches how the data actually flows. Use `compose` when the code is clearer nested (small combinators like `R.o(R.inc, R.length)`).
- **Keep `as` casts out of Ramda code.** If a cast is needed, the real fix is the typing pattern (see `references/typescript.md`).

## Reference files

Read these on demand — they're the bulk of the knowledge:

- `references/functions.md` — task-indexed function dictionary with verified signatures (the "which function" answer lives here).
- `references/patterns.md` — imperative → Ramda conversion patterns with before/after examples.
- `references/anti-patterns.md` — the verified trap list: wrong argument orders, nonexistent functions, mutation bugs, and performance mistakes.
- `references/typescript.md` — `@types/ramda` inference traps and the exact patterns that fix them. **Read this whenever the user mentions type errors, `as any`, `never`, or `unknown`.**
- `references/concepts.md` — deep explanations for concepts (curry, data-last, lens, point-free, placeholder, transduce, …).

## A note on version

All signatures and type behaviors in this skill were verified against **Ramda 0.32.0** / `@types/ramda 0.32.0` / `types-ramda 0.32.0`. If the user is on a different version, say so when it matters (e.g. `R.flow`, `R.rebuild` only exist in recent versions).
