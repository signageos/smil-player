# Priority System Refactoring Plan

## Problem Statement

The priority system has two architectural issues:

1. **Uncontrolled mutation**: 22 mutation sites across 4 files bypass `PriorityStateManager`, making state changes untrackable and untestable
2. **Polling + sleep-based ordering**: 3 loops poll state at 10Hz, and multi-priority ordering relies on a sleep-timing hack (`sleep(priorityGap * 100ms)`)

## Solution: Reactive State Manager with Priority-Ordered Notification

Keep shared mutable state (correct for JS async model), but:
- Route ALL mutations through `PriorityStateManager`
- Add `waitUntil(predicate)` for reactive waiting (replaces polling)
- Add `waitForTurn(predicate, priorityLevel)` for priority-ordered waking (replaces sleep stagger)
- Every mutation calls `notifyWaiters()` which resolves only the highest-priority satisfied waiter

```
BEFORE: 4 files × 22 mutation sites → shared objects ← polling loops + sleep ordering
AFTER:  all mutations → StateManager → notifyWaiters → waitUntil/waitForTurn resolves
```

---

## Implementation Steps

### Step 1 — Fix Direct Mutation in Waiter
**Risk: Low** | Files: 3 source + 2 test

`priorityWaiter.ts:72` directly mutates `timesPlayed = 0`, bypassing state manager.

- Add `resetTimesPlayed()` method to `PriorityStateManager`
- Add `waiterIndex` parameter to `waitForPriorityRelease`
- Replace direct mutation with `stateManager.resetTimesPlayed(region, waiterIndex)`
- Update 3 call sites in `playlistPriority.ts`

**Verify**: `tsc --noEmit` + `npm test`

---

### Step 2 — Remove `as any` Casts from PromiseAwaiting
**Risk: Low** | Files: 3 source

`promiseAwaiting` entries require `as any` to access `highestProcessingPriority` and `version`.

- Restructure `PromiseAwaiting` type in `playlistModels.ts` so tracking fields are first-class
- Remove `as any` casts in `playlistProcessor.ts` (lines 523-524, 1104) and `playlistCommon.ts` (line 160)

**Verify**: `tsc --noEmit` + `npm test` (no runtime change)

---

### Step 3 — Move Priority Cleanup Out of PlaylistCommon
**Risk: Low** | Files: 6 source + 1 test

`cleanupPriorityTracking` and `cleanupExpiredPriority` are priority-specific but live in the shared base class.

- Move both methods to `PriorityStateManager`
- Add to `IPlaylistPriority` interface
- Add delegating methods on `PlaylistPriority`
- Update ~6 call sites in `playlistProcessor.ts`: `this.cleanupPriorityTracking(...)` → `this.priority.cleanupPriorityTracking(...)`
- Update `createEngine()` wiring in `playlistTraverser.ts`

**Verify**: `tsc --noEmit` + `npm test` + `playwright test --workers=1`

---

### Step 4 — Extract PriorityConflictResolver
**Risk: Medium** | Files: 1 modified + 2 created

All behavior handlers are private on `PlaylistPriority`, which requires `sos`, `files`, DOM for instantiation — blocking unit testing.

- Create `PriorityConflictResolver` with injected deps: `stateManager`, `sideEffects`, `synchronization`, `getCancelFunction`, `getCurrentlyPlayingSrc`
- Move 7 handlers from `playlistPriority.ts` → `priorityConflictResolver.ts` as public methods
- `PlaylistPriority` delegates to resolver, shrinks to ~100 lines
- Create 12+ unit tests using mock deps (no DOM, no `sos`)

**Verify**: `tsc --noEmit` + `npm test` + `playwright test --workers=1`

---

### Step 5 — Optimize findMatchingEntryIndex
**Risk: Low** | Files: 1 source + 1 test

`findMatchingEntryIndex` uses `lodash.isEqual` for deep comparison on every element. The match is for identity, not change detection.

- Add `isMediaMatch(a, b)` using `src` + `regionName` + `dynamicValue` + `triggerValue`
- Replace `isEqual` call, remove lodash import

**Verify**: `npm test` + `playwright test --workers=1`

---

### Step 6a — Add `waitUntil` / `waitForTurn` Infrastructure
**Risk: Low** | Files: 1 source + 1 test | No callers migrated yet

Core reactive notification mechanism.

```typescript
// Unordered — for pause/stop polling replacement
waitUntil(region, predicate): Promise<void>

// Priority-ordered — only highest-priority satisfied waiter wakes
waitForTurn(region, predicate, priorityLevel): Promise<void>
```

`notifyWaiters()` logic:
- Collects all waiters whose predicates are satisfied
- Resolves ALL unordered (`waitUntil`) waiters
- Resolves ONLY the highest-priority ordered (`waitForTurn`) waiter
- Others stay registered → re-evaluated on next mutation

Multi-priority ordering example (P3 playing, P2 and P1 waiting):
```
P3 finishes → notifyWaiters → only P2 resolved (highest)
P2 → setPlaying → notifyWaiters → P1 resolved (only remaining)
P1 → sees P2 playing → re-targets to P2 → keeps waiting
```

Add `this.notifyWaiters(regionName)` to end of every existing mutation method.

**Verify**: `npm test`

---

### Step 6b — Add `cancelAllInRegion` + Migrate 11 Cancel Sites
**Risk: Medium** | Files: 6 source

The pattern `entry.player.playing = false; resolvePlayingDeferred(entry.player)` is repeated 11 times across `playlistProcessor.ts`, `playlistTriggers.ts`, `dynamicTools.ts`, `playlistCommon.ts`.

- Add `cancelAllInRegion(region, filter?)` to `PriorityStateManager`
- Expose via `IPlaylistPriority` interface
- Migrate all 11 sites to use it

**Verify**: `npm test` + `playwright test --workers=1`

---

### Step 6c — Migrate Direct `setPlaying` Call
**Risk: Low** | Files: 3 source

`playlistProcessor.ts:1279` directly sets `player.playing = true` + `ensurePlayingDeferred`.

- Replace with `this.priority.setPlaying(region, index)`
- Add `setPlaying` to `IPlaylistPriority` as delegating method

**Verify**: `npm test` + `playwright test --workers=1`

---

### Step 6d — Add `aliasRegion` / `cloneRegion`
**Risk: Low** | Files: 4 source

Two sites directly assign region arrays: `playlistProcessor.ts:1370` (alias) and `1770` (clone).

- Add `aliasRegion(from, to)` and `cloneRegion(from, to)` to state manager
- Expose via interface, migrate both call sites

**Verify**: `playwright test --workers=1`

---

### Step 6e — Replace 3 Polling Loops with `waitUntil`
**Risk: HIGH** | Files: 1 source

Three `while (condition) { sleep(100) }` loops:
- HTML pause (`playlistProcessor.ts:929`): `while (contentPause !== 0)`
- Video pause (`playlistProcessor.ts:1374`): `while (contentPause !== 0)`
- Video stop-check (`playlistProcessor.ts:1550`): `while (!stop && !ended)`

Replace with:
```typescript
await this.priority.waitUntil(region, e => e[index]?.player.contentPause === 0)
```

Cancel check (`getCancelFunction`) stays as a separate racing promise with 1s poll (SMIL updates are rare).

**Verify**: `playwright test --workers=1` — ALL 15 priority e2e tests

---

### Step 6f — Migrate `priorityWaiter.ts` to `waitForTurn` + Remove Sleep Stagger
**Risk: Medium** | Files: 1 source

The sleep-based ordering hack:
```typescript
// REMOVE THIS:
const sleepMs = (maxPriorityLevel - priorityLevel) * 100;
await sleep(sleepMs);
```

Replace with priority-ordered waiting:
```typescript
await stateManager.waitForTurn(
    regionName,
    entries => !entries[blockerIndex].player.playing,
    priorityObject.priorityLevel,  // ordering metadata
);
```

`waitForTurn` only wakes the highest-priority waiter. No sleep needed.

**Verify**: `npm test` + `playwright test --workers=1` — especially multi-level cascade tests

---

### Step 7 — Add Watchdog Timeout
**Risk: Low** | Files: 1 source

If a waiter's scheduling window expires while blocked in `waitForTurn`, no state mutation fires — the waiter hangs.

- **No fixed timeout on `_registerWaiter`** — content can play for minutes/hours; a fixed timeout causes false wakeups
- **Precise endTime race in `waitForPriorityRelease`**: race `waitForTurn` against `sleep(waiterEndTime - now)` for wallclock-scheduled waiters
- Wallclock waiter: timer fires when waiter's own window closes → `shouldContinueWaiting` → expired
- Repeat-count / indefinite waiter: no timer, exits via state changes or SMIL update
- Orphaned blocker (crash): wallclock waiters catch it via endTime timer; indefinite waiters require SMIL update (same as today)

**Verify**: `npm test` + `playwright test --workers=1 --grep priority`

---

### Step 8 — Break Inheritance from PlaylistCommon (DEFERRED)

After Steps 1-7, `PlaylistPriority` only uses `getCancelFunction`, `synchronization`, and `currentlyPlaying[region].src` from `PlaylistCommon` — all already injected into resolver. Breaking inheritance makes it standalone. **Deferred** — high risk, touches entire playlist architecture.

---

## Step Dependencies

```
Step 1 ──┐
Step 2 ──┤── independent, can run in parallel
Step 5 ──┘
Step 3 ──── depends on Step 2 (clean types)
Step 4 ──── depends on Step 1 (waiterIndex param)
Step 6a ─── no deps (additive infrastructure)
Step 6b ─── depends on 6a
Step 6c ─── depends on 6a
Step 6d ─── depends on 6a
Step 6e ─── depends on 6a (highest risk, do after 6b-6d prove stable)
Step 6f ─── depends on 6a (second highest risk)
Step 7 ──── depends on 6a
Step 8 ──── deferred
```

## Risk Assessment

| Step | Risk | Reason |
|------|------|--------|
| 1, 2, 5, 6a, 6c, 6d, 7 | **Low** | Additive or type-only changes, no behavior change |
| 3, 4, 6b | **Medium** | Move code between files, change call sites |
| 6f | **Medium** | Replaces sleep ordering with structural ordering |
| 6e | **HIGH** | Replaces 3 polling loops — timing-sensitive, affects all priority behaviors |

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| State mutations outside StateManager | 22 | 0 |
| Polling loops (10Hz) | 3 | 0 |
| Priority ordering | Sleep stagger (100ms/level) | `waitForTurn` (structural, 0ms) |
| Priority transition latency | 100-200ms per level | ~0ms |
| Scattered cancel sites | 11 | 1 (`cancelAllInRegion`) |
| Conflict resolution testable | No (private methods) | Yes (PriorityConflictResolver) |
| `as any` casts | 3 | 0 |
| Priority code in PlaylistCommon | 40 lines | 0 |
| Deep-equality per element | 1 (lodash isEqual) | 0 (targeted match) |
| Hang protection | None | Waiter endTime race |
| Unit tests | ~65 | ~95-105 |

## Verification Protocol

After each step:
1. `npx tsc --noEmit` — type check
2. `npm test` — unit tests
3. For Steps 3, 4, 6b-6f, 7: `npx playwright test --workers=1 --grep priority` — priority e2e tests only
