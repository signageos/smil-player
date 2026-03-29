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
function fillWallclock(fileString, fileName) {
    let parsedFileString = fileString;
    switch (fileName) {
        case enums_1.SMILUrls.priorityDefer.split('/').pop():
            // P1 iter=7.4s, P2 iter=9.8s, P3 iter=10.4s. Downloads take 5-15s.
            // Each window: enough for downloads + 1-2 iterations. Current iteration finishes even past wallclock end.
            parsedFileString = parsedFileString.replace('PRIORITY_1_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_1_END', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_END', `wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_BEGIN', `wallclock(R/${formatDate(moment().subtract(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_END', `wallclock(R/${formatDate(moment().add(90, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.priorityPause.split('/').pop():
            // Pause: P3 always active, P2 interrupts at +20s, P1 interrupts at +50s
            // Wider windows than stop to give test time to observe each priority phase including resume
            parsedFileString = parsedFileString.replace('PRIORITY_1_BEGIN', `wallclock(R/${formatDate(moment().add(50, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_1_END', `wallclock(R/${formatDate(moment().add(70, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_END', `wallclock(R/${formatDate(moment().add(100, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
            break;
        case enums_1.SMILUrls.wallclockFuture.split('/').pop():
            parsedFileString = parsedFileString.replace('PRIORITY_1_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_1_END', `wallclock(R/${formatDate(moment().add(35, 'seconds'))}/P1D)`);
            break;
        case enums_1.SMILUrls.conditionalTimePriority.split('/').pop():
            parsedFileString = parsedFileString.replace('TIME_BEGIN', `${formatTime(moment().subtract(60, 'seconds'))}`);
            parsedFileString = parsedFileString.replace('TIME_END', `${formatTime(moment().add(10, 'seconds'))}`);
            break;
        default:
            parsedFileString = parsedFileString.replace('PRIORITY_1_BEGIN', `wallclock(R/${formatDate(moment().add(40, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_1_END', `wallclock(R/${formatDate(moment().add(60, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_BEGIN', `wallclock(R/${formatDate(moment().add(20, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_END', `wallclock(R/${formatDate(moment().add(80, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_BEGIN', `wallclock(R/${formatDate(moment().subtract(10, 'minute'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_END', `wallclock(R/${formatDate(moment().add(10, 'minute'))}/P1D)`);
    }
    return parsedFileString;
}
exports.fillWallclock = fillWallclock;
