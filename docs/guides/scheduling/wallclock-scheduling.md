---
sidebar_position: 1
---

# Playback scheduling via WallClock

The `wallclock` module of SMIL supports using ISO-8601 date/time specification as part of its event triggers.

For digital signage, `wallclock` is a crucial component that allows precise scheduling of media playback.

Wallclock provides an absolute and precise synchronization mechanism. While one may specify time offset values in the
`dur` and `begin` attributes, such offsets are relative and errors easily accumulate to prevent using time offsets as a
precise synchronization mechanism.

Due to its absolute timing, elements using `wallclock` events must be direct children of `<par>` and `<excl>` playlists.

Description in the table below is tied to the usage of the wallclock value in the `begin` attribute.

| WallClock Value           | Playback start description                                                                                                                   |
|:--------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------|
| 2020-01-01                | Starts on midnight of January 1, 2020, it keeps playing in the sequence from that time on.                                                   |
| 2020-01-01T09:00:00.000   | Starts at 9:00 AM of January 1, 2020, it keeps playing in the sequence from that time on.                                                    |
| 2020-01-01+w1             | Starts on the next upcoming Monday (w1 — ISO weekday, 1=Monday … 7=Sunday).                                                                  |
| 2020-01-01-w7             | Starts on the last Sunday (w7) before (-) January 1, 2020 (equivalent to December 29, 2019), it keeps playing in the sequence from that time on. |
| R/2020-01-01T09:00/P1D    | Starts at 9:00 AM and repeats (R) every day (P1D). The date gives the reference starting point and can be any date in the past.              |
| R/2020-01-01+w3T09:00/P1D | Starts at 9:00 AM every Wednesday (+w3): combine the weekday designator with the daily repeat period (P1D) for weekly scheduling.            |

> **Supported repeat period:** the only supported repetition period is **`P1D`** (daily). For weekly schedules,
> combine `P1D` with a weekday designator (`+wN`), as in the last row above. Other ISO-8601 periods (`P1W`, `P2D`,
> `PT1H`, …) and the bounded-repeat prefix (`R6/…`) are **not supported** — a schedule written with them will not
> repeat as intended and may never play. Use one wallclock-scheduled block per required window, or
> [conditional expressions](conditional-playback.md) for weekday/time-based rules.

## Examples with beginning and end

### Play at specific time each day

The following code starts a playlist between 9 AM and 12 PM each day.

What is specific for this use case is that Wallclock() is using the date inside `begin` as a reference point for
starting the playback. The date in the `end` attribute has to be **the same** if the playlist should be repeated (R) in
the set time every day (P1D).

```xml

<par dur="indefinite">
    <seq begin="wallclock(R/2020-01-01T09:00/P1D)" end="wallclock(R/2020-01-01T12:00/P1D)">
        ...
    </seq>
</par>
```

A scheduled playlist MUST BE enclosed within a section. If the schedule is valid forever, set the duration of the
playlist to "indefinite."

The date 2020-01-01 gives a reference to a starting point in time, and can be any date in the past. "P1D" is the
ISO-8601 designation for a repeat period of 1 day.

### Play at a given day of week

Play between 9 AM and 12 noon on each Wednesday morning:

```xml

<par dur="indefinite">
    <seq begin="wallclock(R/2020-01-01+w3T09:00/P1D)" end="wallclock(R/2020-01-01+w3T12:00/P1D)">
        ...
    </seq>
</par>
```

+w3 designates the 3rd ISO weekday, or Wednesday. Note the repeat period stays `P1D` — the weekday designator is what
restricts playback to Wednesdays (`P1W` is not supported).

### Play at a specific time

Play once on January 1, 2010, between 9 AM and 12 noon.

```xml

<par dur="indefinite">
    <seq begin="wallclock(2010-01-01T09:00)" end="wallclock(2010-01-01T12:00)">
        ...
    </seq>
</par>
```

Note that the `R` repeat designator is removed.
