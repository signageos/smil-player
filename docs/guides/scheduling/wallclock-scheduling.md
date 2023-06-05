# Playback scheduling via WallClock

The `wallclock` module of SMIL supports using ISO-8601 date/time specification as part of its event triggers.

For digital signage, `wallclock` is a crucial component that allows precise scheduling of media playback.

Wallclock provides an absolute and precise synchronization mechanism. While one may specify time offset values in the `dur` and `begin` attributes, such offsets are relative and errors easily accumulate to prevent using time offsets as a precise synchronization mechanism.

Due to its absolute timing, elements using `wallclock` events must be direct children of `<par>` and `<excl>` playlists.

Description in the table below is tight to the usage of the wallclock value in the `begin` attribute.

| WallClock Value | Playback start description |
| :--- | :--- |
| 2020-01-01 | Starts on midnight of January 1, 2020, it keeps playing in the sequence from that time on. |
| 2020-01-01T09:00:00.000 | Starts at 9:00 AM of January 1, 2020, it keeps playing in the sequence from that time on. |
| 2020-01-01+w1 | Starts on first Monday (w1) after (+) January 1, 2020 (equivalent to January 6, 2020), it keeps playing in the sequence from that time on. |
| 2020-01-01-w7 | Starts on last Sunday (w7) before (-) January 1, 2020 (equivalent to December 29, 2019), it keeps playing in the sequence from that time on. |
| R/2020-01-01+w3T09:00/P1W | Starts at 9:00 am every Wednesday (+w3), repeat (R) every week (P1W) |
| R/2020-01-01+w5T09:00/P2W | Starts at 9:00 am every second (P2W) Wednesday (+w3) |
| R/2020-01-01/P1D | Starts on midnight of January 1, 2020, it keeps playing in the sequence from that time on every day |
| R/2020-01-01/P2D | Starts on midnight of January 1, 2020 (which was Wednesday), it keeps playing every other day. It will play 1st, 3rd, 5th, 7th,.... |
| R/2020-01-01T09:00/PT1H | Starts at 9:00 AM of January 1, 2020 AND repeating at the end of every hour only. |
| R6/2020-01-01+w1/P1W | Starts on the first Monday after midnight of January 1, 2020 (+w1) AND playing only on Monday (P1W) for 6 weeks from the 1st of January (R6) |

## Examples with beginning and end

### Play at specific time each day

The following code starts a playlist between 9 AM and 12 noon each day.

What is specific for this use case is that Wallclock() is using the date inside `begin` as a reference point for starting the playback. The date in the `end` attribute has to be **the same** if the playlist should be repeated (R) in the set time every day (P1D).

```xml
<par dur="indefinite">
  <seq begin="wallclock(R/2020-01-01T09:00/P1D)" end="wallclock(R/2020-01-01T12:00/P1D)">
    ...
  </seq>
</par>
```

A scheduled playlist MUST BE enclosed within a section. If the schedule is valid forever, set the duration of the to "indefinite."

The date 2020-01-01 gives a reference to a starting point in time, and can be any date in the past. "P1D" is the ISO-8601 designation for a repeat period of 1 day.

### Play at a given day of week

Play between 9 AM and 12 noon on each Wednesday morning:

```xml
<par dur="indefinite">
  <seq begin="wallclock(R/2020-01-01+w3T09:00/P1W)" end="wallclock(R/2020-01-01+w3T12:00/P1W)">
    ...
  </seq>
</par>
```

+w3 designates the 3rd weekday, or Wednesday. "P1W" repeats the schedule each week.

### Play at a specific time

Play once on January 1, 2010, between 9 AM and 12 noon.

```xml
<par dur="indefinite">
  <seq begin="wallclock(2010-01-01T09:00)" end="wallclock(2010-01-01T12:00)">
    ...
  </seq>
</par>
```

Note that `R` repeat designator is removed.

### ISO 8601 duration format

ISO 8601 Durations are expressed using the following format, where (n) is replaced by the value for each of the date and time elements that follow the (n):

P(n)Y(n)M(n)DT(n)H(n)M(n)S

**Where:**

**P** is the duration designator (referred to as "period"), and is always placed at the beginning of the duration. <br />
**Y** is the year designator that follows the value for the number of years. <br />
**M** is the month designator that follows the value for the number of months. <br />
**W** is the week designator that follows the value for the number of weeks. <br />
**D** is the day designator that follows the value for the number of days. <br />
**T** is the time designator that precedes the time components. <br />
**H** is the hour designator that follows the value for the number of hours. <br />
**M** is the minute designator that follows the value for the number of minutes. <br />
**S** is the second designator that follows the value for the number of seconds.

**For example:**

`P3Y6M4DT12H30M5S`

Represents a duration/period (P) of three years (3Y), six months (6M), four days (4D), and time (T) twelve hours (12H), thirty minutes (30M), and five seconds (5S).
