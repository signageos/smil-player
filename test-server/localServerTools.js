"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const moment = require('moment');
const enums_1 = require("./enums");
function formatDate(date) {
    return date.format('YYYY-MM-DDTHH:mm:ss');
}
exports.formatDate = formatDate;
function formatTime(date) {
    return date.format('HH:mm:ss');
}
exports.formatTime = formatTime;
/**
 * Deterministic per-file Last-Modified timestamp (ms since epoch, whole seconds).
 *
 * The player's moved-content dedup treats Last-Modified as part of file identity;
 * express.static derives Last-Modified from filesystem mtime, and git does NOT
 * preserve mtimes — a fresh checkout/worktree stamps every test asset with the
 * same checkout time, which folds distinct assets into one identity and leaves
 * playlist elements with an empty localFilePath (observed: priorityFutureGallery
 * red in any fresh worktree while green in a tree with hand-staggered mtimes).
 * Hashing the basename into a fixed 10-year window makes asset identity a
 * function of the file NAME, independent of checkout state.
 */
function deterministicLastModifiedMs(fileName) {
    // FNV-1a 32-bit
    let hash = 0x811c9dc5;
    for (let i = 0; i < fileName.length; i++) {
        hash ^= fileName.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    // Window ends in 2020 — always in the past; caches may treat a future
    // Last-Modified as invalid.
    const baseMs = Date.UTC(2010, 0, 1);
    const windowSeconds = 315360000; // ~10 years
    return baseMs + (hash % windowSeconds) * 1000;
}
exports.deterministicLastModifiedMs = deterministicLastModifiedMs;
// Per-process cache so every device in a sync group receives identical wallclock
// windows for priorityFutureGallery.smil (the customer file is static).
const futureGalleryCache = { filledAt: 0 };
function fillWallclock(fileString, fileName, requestCount = 1) {
    let parsedFileString = fileString;
    switch (fileName) {
        case enums_1.SMILUrls.priorityDefer.split('/').pop():
            // P1 iter=7.4s, P2 iter=9.8s, P3 iter=10.4s. Downloads take 5-15s.
            // Each window: enough for downloads + 1-2 iterations. Current iteration finishes even past wallclock end.
            parsedFileString = parsedFileString.replace('DEFER_P1_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_P1_END', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_P2_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_P2_END', `wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_P3_END', `wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityPause.split('/').pop():
            // Pause: P3 always active, P2 interrupts at +35s, P1 interrupts at +65s
            // Wide windows survive 20s asset download: P3 gets 15s+ playback before P2
            parsedFileString = parsedFileString.replace('PAUSE_P1_BEGIN', `wallclock(R/${formatDate(moment().add(65, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P1_END', `wallclock(R/${formatDate(moment().add(85, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P2_BEGIN', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P2_END', `wallclock(R/${formatDate(moment().add(120, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityStop.split('/').pop():
            // Stop: P3 always active, P2 interrupts at +35s (stops P3), P1 interrupts at +60s (stops P2)
            // P1 ends at +80s → P2 restarts, P2 ends at +100s → P3 restarts
            // Wide windows survive 20s asset download: P3 gets 15s+ playback before P2
            parsedFileString = parsedFileString.replace('STOP_P1_BEGIN', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P1_END', `wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P2_BEGIN', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P2_END', `wallclock(R/${formatDate(moment().add(100, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityDeferExpiry.split('/').pop():
            // P_high always active, P_low has a short window that expires while deferred behind P_high.
            // Tests playlistPriority.ts:655-664 — deferred element abandoned when its endTime passes.
            parsedFileString = parsedFileString.replace('DEFER_EXP_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_EXP_HIGH_END', `wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_EXP_LOW_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_EXP_LOW_END', `wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityNever.split('/').pop():
            // P_high active for 40s with lower="never", P_low always active but blocked until P_high ends.
            // Tests handleNeverBehaviour — lower-priority content permanently skipped while higher is active.
            parsedFileString = parsedFileString.replace('NEVER_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('NEVER_HIGH_END', `wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('NEVER_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('NEVER_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.prioritySeqCampaign.split('/').pop():
            // Production-style: absolute wallclock (no R/ recurrence), seq-based campaign rotation.
            // High priority campaigns active for 60s, then expire → low priority plays.
            // 60s allows enough margin for prefetch + loader even on slow machines.
            parsedFileString = parsedFileString.replace(/SEQ_CAMP_HIGH_BEGIN/g, `wallclock(${formatDate(moment())})`);
            parsedFileString = parsedFileString.replace(/SEQ_CAMP_HIGH_END/g, `wallclock(${formatDate(moment().add(60, 'seconds'))})`);
            break;
        case 'customerReproDelayed.smil':
        case enums_1.SMILUrls.prioritySingleCampaign.split('/').pop():
            // Customer repro: SINGLE video in higher priorityClass, wallclock window
            // active for the whole observation (10 minutes). Expected: video loops.
            parsedFileString = parsedFileString.replace(/SINGLE_CAMP_BEGIN/g, `wallclock(${formatDate(moment().add(parseInt(process.env.CAMP_DELAY_S || '45', 10), 'seconds'))})`);
            parsedFileString = parsedFileString.replace(/SINGLE_CAMP_END/g, `wallclock(${formatDate(moment().add(10, 'minute'))})`);
            break;
        case enums_1.SMILUrls.priorityPeerDefer.split('/').pop():
            // Peer A active for 30s, Peer B active for 60s. Both start at +0s.
            // A is first in XML → plays first. B defers (peer="defer") until A's wallclock ends.
            parsedFileString = parsedFileString.replace('PEER_DEFER_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_DEFER_A_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_DEFER_B_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_DEFER_B_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityThreeLevelDeferExpiry.split('/').pop():
            // Three-level defer: P1 active 30s, P2 expires at 15s while deferred, P3 always active.
            // After P1 ends, P2 is abandoned (expired), P3 plays.
            // BEGIN offset accounts for asset download latency (~15s).
            parsedFileString = parsedFileString.replace('THREE_LVL_P1_BEGIN', `wallclock(R/${formatDate(moment().subtract(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P1_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P2_BEGIN', `wallclock(R/${formatDate(moment().subtract(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P2_END', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityPeerPause.split('/').pop():
            // Peer A active the entire test, Peer B active 30s–50s. Both are peers (same priorityClass).
            // At +30s Peer B pauses Peer A. At +50s Peer B ends, Peer A resumes from pause point.
            // Wide windows survive 20s asset download: A gets 10s+ playback before B pauses
            parsedFileString = parsedFileString.replace('PEER_PAUSE_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_PAUSE_A_END', `wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_PAUSE_B_BEGIN', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_PAUSE_B_END', `wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.wallclockFuture.split('/').pop():
            parsedFileString = parsedFileString.replace('FUTURE_P1_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('FUTURE_P1_END', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.conditionalTimePriority.split('/').pop():
            // Window: +30s. Enough for 15s download + 2 high-priority cycles (~16s).
            // Test reaches transition check at ~26s from SMIL-fetch, 13s timeout catches +30s end.
            parsedFileString = parsedFileString.replace('TIME_BEGIN', `${formatTime(moment().subtract(60, 'seconds'))}`);
            parsedFileString = parsedFileString.replace('TIME_END', `${formatTime(moment().add(30, 'seconds'))}`);
            break;
        case enums_1.SMILUrls.prioritySmilUpdate.split('/').pop():
            // Phase 1 (requestCount=1): P_high active for 60s, P_low deferred.
            // Phase 2+ (requestCount>1): P_high active for 15s then expires → P_low plays.
            // Refresh content="5" in the SMIL triggers ResourceChecker every 5s.
            // Phase 2 verifies: P_high plays immediately after reload (no P_low flicker),
            // then P_high expires and P_low takes over cleanly.
            if (requestCount <= 1) {
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            }
            else {
                // P_high still active but with a short 15s window from now
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_END', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            }
            parsedFileString = parsedFileString.replace('UPDATE_P_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('UPDATE_P_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityLowerStop.split('/').pop():
            // P_high has lower="stop" (remapped to never by fix). P_high active 90s, P_low always active.
            // 90s matches the test's Timeouts.firstElement (90s) budget: the window is
            // once-a-day (R/.../P1D), so any boot-to-first-play stall longer than the
            // window fails unrecoverably — a 60s window made the last 30s of that
            // budget illusory (observed under full-suite load 2026-06-11, both
            // attempts). The test waits for P_low's first appearance with
            // Timeouts.priorityWideWindowRelease (100s), NOT priorityTransition (70s):
            // on a warm asset cache the preamble finishes ~fetch+15s, so a 70s wait
            // expired ~fetch+85s — before P_low can appear (~fetch+93s, just after
            // this +90s window closes). 100s outlasts the window regardless of how
            // early the preamble finishes (fixed 2026-06-22, commit 824346d).
            parsedFileString = parsedFileString.replace('LOWER_STOP_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_STOP_HIGH_END', `wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_STOP_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_STOP_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityLowerPause.split('/').pop():
            // P_high has lower="pause" (remapped to defer by fix). P_high active 90s, P_low always active.
            // 90s for the same reason as priorityLowerStop above: align the once-a-day
            // window with the test's 90s firstElement budget so a load stall inside
            // the budget cannot make the window unreachable.
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_HIGH_END', `wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityDeferInterrupt.split('/').pop():
            // P1 (highest) arrives at +30s after fetch, plays until +60s.
            // P2 (middle) already active (begin=-2min), expires at +40s (during P1's window).
            // P3 (lowest) always active, defers behind P2, then P1 stops P2.
            // When P1 ends at +60s, P2 expired at +40s → P3 plays immediately.
            // P2 begin uses subtract() so it's already active when processing starts,
            // surviving any initialization delay (asset download, SMIL parsing, etc.).
            parsedFileString = parsedFileString.replace('DEFER_INT_P1_BEGIN', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P1_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P2_BEGIN', `wallclock(R/${formatDate(moment().subtract(2, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P2_END', `wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityOscillation.split('/').pop():
            // Two high-priority windows with a gap: -15s to +20s and +35-50s. P_low always active.
            // Tests full stop→resume→stop→resume cycle.
            // BEGIN offset accounts for asset download latency (~15s).
            parsedFileString = parsedFileString.replace('OSC_HIGH_A_BEGIN', `wallclock(R/${formatDate(moment().subtract(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_HIGH_A_END', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_HIGH_B_BEGIN', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_HIGH_B_END', `wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityFutureGallery.split('/').pop():
            // Future-begin priority gallery (mirrors production GalleryModule playlist):
            // higher priorityClass window opens DURING playback at +60s and closes at +180s.
            // NON-repeating wallclock format on purpose — matches the customer playlist.
            // Lower class gallery is always active; its second campaign seq has a wide
            // currently-active window.
            //
            // SYNC determinism: the customer file is static, so both synced devices see
            // IDENTICAL wallclock windows. Fill once and cache for the fill TTL so every
            // device in a sync group gets the same timestamps regardless of fetch time.
            if (futureGalleryCache.content && Date.now() - futureGalleryCache.filledAt < 400000) {
                parsedFileString = futureGalleryCache.content;
                break;
            }
            parsedFileString = parsedFileString.replace('FUTGAL_HIGH_BEGIN', `wallclock(${formatDate(moment().add(60, 'seconds'))})`);
            parsedFileString = parsedFileString.replace('FUTGAL_HIGH_END', `wallclock(${formatDate(moment().add(180, 'seconds'))})`);
            parsedFileString = parsedFileString.replace('FUTGAL_LOWWIN_BEGIN', `wallclock(${formatDate(moment().subtract(60, 'minute'))})`);
            parsedFileString = parsedFileString.replace('FUTGAL_LOWWIN_END', `wallclock(${formatDate(moment().add(60, 'minute'))})`);
            futureGalleryCache.content = parsedFileString;
            futureGalleryCache.filledAt = Date.now();
            break;
        case 'threeLevelPriorityTransition.smil':
            // Group J sync regression — 3-level priority cascade.
            // P1 active at fetch, ends at +30s → P2 takes over.
            // P2 active at fetch, ends at +60s → P3 takes over.
            // P3 always active. Two consecutive priority boundaries on the
            // same group catch any residual state left over from the first
            // transition when the second one fires.
            parsedFileString = parsedFileString.replace('TLP_P1_BEGIN', `wallclock(R/${formatDate(moment().subtract(5, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('TLP_P1_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('TLP_P2_BEGIN', `wallclock(R/${formatDate(moment().subtract(5, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('TLP_P2_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('TLP_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('TLP_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case 'wallclockPriorityTransition.smil':
            // Group D sync regression — 8ef7571 (wallclock-triggered priority transition).
            // P_high is already active at fetch (begin=-5s) and its wallclock end at +45s
            // fires the cross-priority cmd-prepare that exercises the fix's
            // hasPriorityChanged branches. P_low is always active and takes over after.
            parsedFileString = parsedFileString.replace('WPT_HIGH_BEGIN', `wallclock(R/${formatDate(moment().subtract(5, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('WPT_HIGH_END', `wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('WPT_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('WPT_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityPeerStop.split('/').pop():
            // Peer A active 0-90s, Peer B active 30-60s. Both are peers (same priorityClass).
            // At +30s Peer B stops Peer A. At +60s Peer B ends, Peer A recovers via handlePrecedingContentStop.
            // B's window is deliberately WIDE (30s): the player picks up a future-begin peer
            // on a later traversal pass, and under CPU load those passes stretch — a 15s
            // window was jumped entirely in loaded runs (observed 6x on 2026-06-11: img_3
            // never shown). 30s spans ~4 Peer A inner-seq cycles even when load doubles them.
            parsedFileString = parsedFileString.replace('PEER_STOP_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_STOP_A_END', `wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_STOP_B_BEGIN', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_STOP_B_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            break;
        case 'priorityPeerNever.smil':
            // Peer A active 0-120s (wide: stays the active peer for the whole test).
            // Peer B begins at +30s — while Peer A is playing — and wants to play until
            // +120s. With peer="never" Peer B is BLOCKED: it must never interrupt Peer A,
            // so Peer B's content (img_3/img_2) must not appear during A's window. Begin at
            // +30s (mirrors priorityPeerStop): a future-begin peer is picked up on a later
            // traversal pass, and under CPU load those passes stretch — a narrow window can
            // be jumped entirely, so the windows are deliberately wide.
            parsedFileString = parsedFileString.replace('PEER_NEVER_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_NEVER_A_END', `wallclock(R/${formatDate(moment().add(120, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_NEVER_B_BEGIN', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_NEVER_B_END', `wallclock(R/${formatDate(moment().add(120, 'seconds'))}/P1D)`);
            break;
        case 'wallclockEndBoundary.smil':
            // Relative begin/end (the 2011-begin + relative-end mix is parsed as "permanently
            // expired"). begin is safely in the past so the element starts as soon as it is
            // scheduled (after the ~1s prefetch + cold boot). end is ~25s out so it passes
            // WHILE the ~35s in-flight <seq repeatCount="8"> element is mid-play. `end` is a
            // latest-START guard, so that element must keep advancing past `end`, not be cut off.
            parsedFileString = parsedFileString.replace('WC_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('WC_END', `wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`);
            break;
        case 'clockSkewWallclock.smil':
            // Group E3 sync regression — clock-skew convergence.
            // A near-future wallclock element: future for an unskewed device for the
            // whole ~2-3min run, but already active for a device skewed forward by
            // >15min. The skewed master then inflates maxSyncIndexPerRegion and
            // broadcasts a resync target the unskewed slaves can never reach; they
            // must fall back to their own observed max and keep cycling 0↔1 rather
            // than freeze. 15min/30min gives the skewed device a wide active band
            // while staying comfortably future for the unskewed pair.
            parsedFileString = parsedFileString.replace('SKEW_FUTURE_BEGIN', `wallclock(R/${formatDate(moment().add(15, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('SKEW_FUTURE_END', `wallclock(R/${formatDate(moment().add(30, 'minute'))}/P1D)`);
            break;
        default:
            break;
    }
    return parsedFileString;
}
exports.fillWallclock = fillWallclock;
