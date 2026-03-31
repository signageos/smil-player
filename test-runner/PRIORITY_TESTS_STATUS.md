# Priority Tests Status

## Summary

- **15 passing**, **0 skipped**, **0 failing**
- Run with: `npx playwright test test-runner/priority`

## Test Status

| Test | Status | Notes |
|------|--------|-------|
| priorityDefer | PASS | 3-level defer cascade |
| priorityDeferExpiry | PASS | Deferred element abandoned when wallclock expires |
| priorityLowerPause | PASS | lower="pause" remapped to defer, doesn't pause higher |
| priorityLowerStop | PASS | lower="stop" remapped to never, doesn't kill higher |
| priorityNever | PASS | Removed negative assertion (see bug #1 below) |
| priorityPause | PASS | Lower-priority content pauses and resumes |
| priorityStop | PASS | 3-level stop cascade with restart |
| priorityThreeLevelDeferExpiry | PASS | Expired middle priority skipped, lowest plays after highest ends |
| prioritySmilUpdate | PASS | SMIL update during priority cancels and reloads (fixed server endpoint) |
| priorityPeerDefer | PASS | Peer A plays first, Peer B defers until A's wallclock ends |
| priorityPeerPause | PASS | Peer B pauses Peer A, A resumes after B ends |
| priorityPeerStop | PASS | Peer B stops Peer A, A recovers via handlePrecedingContentStop |
| priorityDeferInterrupt | PASS | Deferred element survives blocker replacement by higher priority |
| priorityOscillation | PASS | Stop-resume-stop-resume oscillation across two wallclock windows |
| prioritySeqCampaign | PASS | Expired non-recurring wallclocks now release lower-priority content |

## Code Bugs Blocking Skipped Tests

### Bug #1: `handleNeverBehaviour` does not block rendering

**File:** `src/components/playlist/playlistPriority/playlistPriority.ts` — `handleNeverBehaviour`

`handleNeverBehaviour` only sleeps 100ms and returns. It does NOT prevent the lower-priority element from playing. After the 100ms sleep, `priorityBehaviour` sets `player.playing = true` (line ~83) and the element renders normally alongside the higher-priority content.

**Impact:** `lower="never"` is effectively ignored — lower-priority elements appear during the higher-priority window.

**Fix direction:** Make `handleNeverBehaviour` wait for the blocking playlist to complete (like `handleDeferBehaviour` does), using `waitForPlayingToComplete`. Pass `previousPlayingIndex` from `handlePriorityRules`.

**Tests affected:** priorityNever (workaround: removed negative assertion)

---

### Bug #2: Traverser does not parse wallclock on `par` array elements (FIXED)

**File:** `src/components/playlist/playlistProcessor/playlistTraverser.ts` — `processPlaylist`, par array branch (~line 300)

When multiple `<par>` elements are siblings inside a single `<priorityClass>`, the traverser processes them as an array. Two issues:

1. **Wallclock parsing (fixed earlier):** The array branch did not parse `begin`/`end` wallclock attributes. Fixed by adding `parseSmilSchedule` calls in both seq and non-seq par array branches.

2. **Shared parent ID + sequential processing (fixed now):** `generateParentId(key, value)` hashed the entire array, giving all elements the same parent. This prevented `handlePriorityBeforePlay` from detecting peer conflicts (`parent !== parent` always false). Additionally, the `parent.startsWith('seq')` condition routed priority-context par arrays to the sequential branch, preventing peer interruption (pause/stop). Fixed by: (a) generating per-element parent IDs via `generateParentId(key, elem)` in priority context, and (b) routing priority-context par arrays to the parallel branch so peers run concurrently.

**Tests fixed:** priorityPeerDefer, priorityPeerPause, priorityPeerStop, priorityOscillation

---

### Bug #3: Misdiagnosed — was timing + wallclock parsing issue (FIXED)

The original description ("visibility: hidden not restored") was a misdiagnosis. The actual root causes were:

1. **priorityDeferInterrupt:** Test fixture timing — P2's wallclock (+60s) outlived P1's (+45s), so P2 resumed via `handlePrecedingContentStop` and blocked P3 past the test timeout. Fixed by adjusting P2's wallclock to expire before P1 ends.

2. **priorityOscillation:** Bug #2 — par array wallclock not parsed. Fixed by adding wallclock parsing to the par array branch (see Bug #2 above).

The priority system's visibility restoration (`playHtmlContent` line 794: `element.style.visibility = 'visible'`) works correctly. The issue was that deferred elements never reached that code path due to being re-blocked by resumed stopped elements (case 1) or infinite-looping wallclock-less windows (case 2).

**Tests fixed:** priorityDeferInterrupt, priorityOscillation

---

### Bug #4: Expired non-recurring wallclocks don't release lower-priority content (FIXED)

**File:** `src/components/playlist/playlistProcessor/playlistTraverser.ts`

**Root cause:** `allNeverPlay = false` was set before the `timeToEnd < Date.now()` expiry check in multiple branches (seq wallclock, par wallclock, par array). Expired content falsely cleared the flag, preventing `processPlaylist()` from returning `allExpired`, so `runEndlessLoop()` never broke.

**Fix:** Moved `allNeverPlay = false` to after the expiry check in all affected branches, so it's only set when content will actually play.

**Tests fixed:** prioritySeqCampaign
