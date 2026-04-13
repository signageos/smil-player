import { Moment } from 'moment';

const moment = require('moment');

import { SMILUrls } from './enums';

export function formatDate(date: Moment): string {
	return date.format('YYYY-MM-DDTHH:mm:ss');
}

export function formatTime(date: Moment): string {
	return date.format('HH:mm:ss');
}

export function fillWallclock(fileString: string, fileName: string, requestCount: number = 1): string {
	let parsedFileString = fileString;
	switch (fileName) {
		case SMILUrls.priorityDefer.split('/').pop():
			// P1 iter=7.4s, P2 iter=9.8s, P3 iter=10.4s. Downloads take 5-15s.
			// Each window: enough for downloads + 1-2 iterations. Current iteration finishes even past wallclock end.
			parsedFileString = parsedFileString.replace(
				'DEFER_P1_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_P1_END',
				`wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_P2_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_P2_END',
				`wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_P3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_P3_END',
				`wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityPause.split('/').pop():
			// Pause: P3 always active, P2 interrupts at +35s, P1 interrupts at +65s
			// Wide windows survive 20s asset download: P3 gets 15s+ playback before P2
			parsedFileString = parsedFileString.replace(
				'PAUSE_P1_BEGIN',
				`wallclock(R/${formatDate(moment().add(65, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PAUSE_P1_END',
				`wallclock(R/${formatDate(moment().add(85, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PAUSE_P2_BEGIN',
				`wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PAUSE_P2_END',
				`wallclock(R/${formatDate(moment().add(120, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PAUSE_P3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PAUSE_P3_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityStop.split('/').pop():
			// Stop: P3 always active, P2 interrupts at +35s (stops P3), P1 interrupts at +60s (stops P2)
			// P1 ends at +80s → P2 restarts, P2 ends at +100s → P3 restarts
			// Wide windows survive 20s asset download: P3 gets 15s+ playback before P2
			parsedFileString = parsedFileString.replace(
				'STOP_P1_BEGIN',
				`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'STOP_P1_END',
				`wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'STOP_P2_BEGIN',
				`wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'STOP_P2_END',
				`wallclock(R/${formatDate(moment().add(100, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'STOP_P3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'STOP_P3_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityDeferExpiry.split('/').pop():
			// P_high always active, P_low has a short window that expires while deferred behind P_high.
			// Tests playlistPriority.ts:655-664 — deferred element abandoned when its endTime passes.
			parsedFileString = parsedFileString.replace(
				'DEFER_EXP_HIGH_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_EXP_HIGH_END',
				`wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_EXP_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_EXP_LOW_END',
				`wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityNever.split('/').pop():
			// P_high active for 40s with lower="never", P_low always active but blocked until P_high ends.
			// Tests handleNeverBehaviour — lower-priority content permanently skipped while higher is active.
			parsedFileString = parsedFileString.replace(
				'NEVER_HIGH_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'NEVER_HIGH_END',
				`wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'NEVER_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'NEVER_LOW_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.prioritySeqCampaign.split('/').pop():
			// Production-style: absolute wallclock (no R/ recurrence), seq-based campaign rotation.
			// High priority campaigns active for 60s, then expire → low priority plays.
			// 60s allows enough margin for prefetch + loader even on slow machines.
			parsedFileString = parsedFileString.replace(
				/SEQ_CAMP_HIGH_BEGIN/g,
				`wallclock(${formatDate(moment())})`,
			);
			parsedFileString = parsedFileString.replace(
				/SEQ_CAMP_HIGH_END/g,
				`wallclock(${formatDate(moment().add(60, 'seconds'))})`,
			);
			break;
		case SMILUrls.priorityPeerDefer.split('/').pop():
			// Peer A active for 30s, Peer B active for 60s. Both start at +0s.
			// A is first in XML → plays first. B defers (peer="defer") until A's wallclock ends.
			parsedFileString = parsedFileString.replace(
				'PEER_DEFER_A_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_DEFER_A_END',
				`wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_DEFER_B_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_DEFER_B_END',
				`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityThreeLevelDeferExpiry.split('/').pop():
			// Three-level defer: P1 active 30s, P2 expires at 15s while deferred, P3 always active.
			// After P1 ends, P2 is abandoned (expired), P3 plays.
			// BEGIN offset accounts for asset download latency (~15s).
			parsedFileString = parsedFileString.replace(
				'THREE_LVL_P1_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(15, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'THREE_LVL_P1_END',
				`wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'THREE_LVL_P2_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(15, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'THREE_LVL_P2_END',
				`wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'THREE_LVL_P3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'THREE_LVL_P3_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityPeerPause.split('/').pop():
			// Peer A active the entire test, Peer B active 30s–50s. Both are peers (same priorityClass).
			// At +30s Peer B pauses Peer A. At +50s Peer B ends, Peer A resumes from pause point.
			// Wide windows survive 20s asset download: A gets 10s+ playback before B pauses
			parsedFileString = parsedFileString.replace(
				'PEER_PAUSE_A_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_PAUSE_A_END',
				`wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_PAUSE_B_BEGIN',
				`wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_PAUSE_B_END',
				`wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.wallclockFuture.split('/').pop():
			parsedFileString = parsedFileString.replace(
				'FUTURE_P1_BEGIN',
				`wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'FUTURE_P1_END',
				`wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`,
			);
			break;
		case SMILUrls.conditionalTimePriority.split('/').pop():
			// Window: +30s. Enough for 15s download + 2 high-priority cycles (~16s).
			// Test reaches transition check at ~26s from SMIL-fetch, 13s timeout catches +30s end.
			parsedFileString = parsedFileString.replace(
				'TIME_BEGIN',
				`${formatTime(moment().subtract(60, 'seconds'))}`,
			);
			parsedFileString = parsedFileString.replace(
				'TIME_END',
				`${formatTime(moment().add(30, 'seconds'))}`,
			);
			break;
		case SMILUrls.prioritySmilUpdate.split('/').pop():
			// Phase 1 (requestCount=1): P_high active for 60s, P_low deferred.
			// Phase 2+ (requestCount>1): P_high active for 15s then expires → P_low plays.
			// Refresh content="5" in the SMIL triggers ResourceChecker every 5s.
			// Phase 2 verifies: P_high plays immediately after reload (no P_low flicker),
			// then P_high expires and P_low takes over cleanly.
			if (requestCount <= 1) {
				parsedFileString = parsedFileString.replace(
					'UPDATE_P_HIGH_BEGIN',
					`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
				);
				parsedFileString = parsedFileString.replace(
					'UPDATE_P_HIGH_END',
					`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
				);
			} else {
				// P_high still active but with a short 15s window from now
				parsedFileString = parsedFileString.replace(
					'UPDATE_P_HIGH_BEGIN',
					`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
				);
				parsedFileString = parsedFileString.replace(
					'UPDATE_P_HIGH_END',
					`wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`,
				);
			}
			parsedFileString = parsedFileString.replace(
				'UPDATE_P_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'UPDATE_P_LOW_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityLowerStop.split('/').pop():
			// P_high has lower="stop" (remapped to never by fix). P_high active 60s, P_low always active.
			// 60s allows enough margin for prefetch + loader even on slow machines.
			parsedFileString = parsedFileString.replace(
				'LOWER_STOP_HIGH_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'LOWER_STOP_HIGH_END',
				`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'LOWER_STOP_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'LOWER_STOP_LOW_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityLowerPause.split('/').pop():
			// P_high has lower="pause" (remapped to defer by fix). P_high active 60s, P_low always active.
			// 60s allows enough margin for prefetch + loader even on slow machines.
			parsedFileString = parsedFileString.replace(
				'LOWER_PAUSE_HIGH_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'LOWER_PAUSE_HIGH_END',
				`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'LOWER_PAUSE_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'LOWER_PAUSE_LOW_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityDeferInterrupt.split('/').pop():
			// P1 (highest) arrives at +30s after fetch, plays until +60s.
			// P2 (middle) already active (begin=-2min), expires at +40s (during P1's window).
			// P3 (lowest) always active, defers behind P2, then P1 stops P2.
			// When P1 ends at +60s, P2 expired at +40s → P3 plays immediately.
			// P2 begin uses subtract() so it's already active when processing starts,
			// surviving any initialization delay (asset download, SMIL parsing, etc.).
			parsedFileString = parsedFileString.replace(
				'DEFER_INT_P1_BEGIN',
				`wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_INT_P1_END',
				`wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_INT_P2_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(2, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_INT_P2_END',
				`wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_INT_P3_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'DEFER_INT_P3_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityOscillation.split('/').pop():
			// Two high-priority windows with a gap: -15s to +20s and +35-50s. P_low always active.
			// Tests full stop→resume→stop→resume cycle.
			// BEGIN offset accounts for asset download latency (~15s).
			parsedFileString = parsedFileString.replace(
				'OSC_HIGH_A_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(15, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'OSC_HIGH_A_END',
				`wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'OSC_HIGH_B_BEGIN',
				`wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'OSC_HIGH_B_END',
				`wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'OSC_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'OSC_LOW_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case 'wallclockPriorityTransition.smil':
			// Group D sync regression — 8ef7571 (wallclock-triggered priority transition).
			// P_high is already active at fetch (begin=-5s) and its wallclock end at +45s
			// fires the cross-priority cmd-prepare that exercises the fix's
			// hasPriorityChanged branches. P_low is always active and takes over after.
			parsedFileString = parsedFileString.replace(
				'WPT_HIGH_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(5, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'WPT_HIGH_END',
				`wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'WPT_LOW_BEGIN',
				`wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'WPT_LOW_END',
				`wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`,
			);
			break;
		case SMILUrls.priorityPeerStop.split('/').pop():
			// Peer A active 0-75s, Peer B active 30-45s. Both are peers (same priorityClass).
			// At +30s Peer B stops Peer A. At +45s Peer B ends, Peer A recovers via handlePrecedingContentStop.
			// Wide windows survive 20s asset download: A gets 10s+ playback before B stops
			parsedFileString = parsedFileString.replace(
				'PEER_STOP_A_BEGIN',
				`wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_STOP_A_END',
				`wallclock(R/${formatDate(moment().add(75, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_STOP_B_BEGIN',
				`wallclock(R/${formatDate(moment().add(30, 'seconds'))}/P1D)`,
			);
			parsedFileString = parsedFileString.replace(
				'PEER_STOP_B_END',
				`wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`,
			);
			break;
		default:
			break;
	}
	return parsedFileString;
}
