"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const moment = require('moment');
const enums_1 = require("../enums/enums");
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
            parsedFileString = parsedFileString.replace('PRIORITY_1_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_1_END', `wallclock(R/${formatDate(moment().add(15, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_BEGIN', `wallclock(R/${formatDate(moment().add(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_2_END', `wallclock(R/${formatDate(moment().add(25, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_BEGIN', `wallclock(R/${formatDate(moment().subtract(0, 'seconds'))}/P1D)`);
            parsedFileString = parsedFileString.replace('PRIORITY_3_END', `wallclock(R/${formatDate(moment().add(45, 'seconds'))}/P1D)`);
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
