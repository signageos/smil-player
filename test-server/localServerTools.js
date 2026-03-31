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
            // Pause: P3 always active, P2 interrupts at +20s, P1 interrupts at +50s
            // Wider windows than stop to give test time to observe each priority phase including resume
            parsedFileString = parsedFileString.replace('PAUSE_P1_BEGIN', `wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P1_END', `wallclock(R/${formatDate(moment().add(70, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P2_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P2_END', `wallclock(R/${formatDate(moment().add(100, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PAUSE_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityStop.split('/').pop():
            // Stop: P3 always active, P2 interrupts at +20s (stops P3), P1 interrupts at +40s (stops P2)
            // P1 ends at +60s → P2 restarts, P2 ends at +80s → P3 restarts
            parsedFileString = parsedFileString.replace('STOP_P1_BEGIN', `wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P1_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P2_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('STOP_P2_END', `wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`);
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
            // High priority campaigns active for 50s, then expire → low priority plays.
            parsedFileString = parsedFileString.replace(/SEQ_CAMP_HIGH_BEGIN/g, `wallclock(${formatDate(moment())})`);
            parsedFileString = parsedFileString.replace(/SEQ_CAMP_HIGH_END/g, `wallclock(${formatDate(moment().add(50, 'seconds'))})`);
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
            parsedFileString = parsedFileString.replace('THREE_LVL_P1_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P1_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P2_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P2_END', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('THREE_LVL_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityPeerPause.split('/').pop():
            // Peer A active the entire test, Peer B active 15s–35s. Both are peers (same priorityClass).
            // At +15s Peer B pauses Peer A. At +35s Peer B ends, Peer A resumes from pause point.
            parsedFileString = parsedFileString.replace('PEER_PAUSE_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_PAUSE_A_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_PAUSE_B_BEGIN', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_PAUSE_B_END', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.wallclockFuture.split('/').pop():
            parsedFileString = parsedFileString.replace('FUTURE_P1_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('FUTURE_P1_END', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.conditionalTimePriority.split('/').pop():
            parsedFileString = parsedFileString.replace('TIME_BEGIN', `${formatTime(moment().subtract(60, 'seconds'))}`);
            parsedFileString = parsedFileString.replace('TIME_END', `${formatTime(moment().add(10, 'seconds'))}`);
            break;
        case enums_1.SMILUrls.prioritySmilUpdate.split('/').pop():
            // Phase 1 (requestCount=1): P_high active, P_low deferred. Both start at +0s.
            // Phase 2+ (requestCount>1): P_high wallclock in the past (expired) → only P_low plays.
            // Refresh content="5" in the SMIL triggers ResourceChecker every 5s.
            if (requestCount <= 1) {
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            } else {
                // P_high wallclock in the past → permanently expired after reload
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
                parsedFileString = parsedFileString.replace('UPDATE_P_HIGH_END', `wallclock(R/${formatDate(moment().subtract(9, 'minute'))}/P1D)`);
            }
            parsedFileString = parsedFileString.replace('UPDATE_P_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('UPDATE_P_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityLowerStop.split('/').pop():
            // P_high has lower="stop" (remapped to never by fix). P_high active 30s, P_low always active.
            // Without fix: P_high gets stopped by P_low arrival. With fix: P_high plays, P_low blocked.
            parsedFileString = parsedFileString.replace('LOWER_STOP_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_STOP_HIGH_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_STOP_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_STOP_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityLowerPause.split('/').pop():
            // P_high has lower="pause" (remapped to defer by fix). P_high active 30s, P_low always active.
            // Without fix: P_high gets paused by P_low arrival. With fix: P_high plays, P_low defers.
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_HIGH_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_HIGH_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('LOWER_PAUSE_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityDeferInterrupt.split('/').pop():
            // P1 arrives at +15s, plays until +40s. P2 starts at +0s, wallclock expires at +25s.
            // P3 always active, defers behind P2, then P1 stops P2, P3 re-defers behind P1.
            // When P1 ends at +40s, P2's wallclock has expired → P3 plays immediately.
            parsedFileString = parsedFileString.replace('DEFER_INT_P1_BEGIN', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P1_END', `wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P2_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P2_END', `wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('DEFER_INT_P3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityOscillation.split('/').pop():
            // Two high-priority windows with a gap: +0-15s and +25-40s. P_low always active.
            // Tests full stop→resume→stop→resume cycle.
            parsedFileString = parsedFileString.replace('OSC_HIGH_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_HIGH_A_END', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_HIGH_B_BEGIN', `wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_HIGH_B_END', `wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_LOW_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('OSC_LOW_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityPeerStop.split('/').pop():
            // Peer A active 0-50s, Peer B active 15-30s. Both are peers (same priorityClass).
            // At +15s Peer B stops Peer A. At +30s Peer B ends, Peer A recovers via handlePrecedingContentStop.
            parsedFileString = parsedFileString.replace('PEER_STOP_A_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_STOP_A_END', `wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_STOP_B_BEGIN', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PEER_STOP_B_END', `wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`);
            break;
        default:
            break;
    }
    return parsedFileString;
}
exports.fillWallclock = fillWallclock;
