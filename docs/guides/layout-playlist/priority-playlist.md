---
sidebar_position: 5
---

# Exclusive/priority playlist

The exclusive playlist allows up to one of its children to play. The start of one media object causes the currently
playing item to either pause or stop.

The priorityClass tag further defines interrupt priorities and behavior (pause, defer, or stop) of media objects when
interrupts occur.

The starting of a media object may be triggered by an event such as a key press or
a [Wallclock](../scheduling/wallclock-scheduling.md) time, as the following sample code illustrates.

> To make the priority playlist work, wrap the whole `<excl>` section in a `<par>` tag. The `begin` and
> `repeatCount` attributes on the `<excl>` element itself are **ignored** — looping comes from the surrounding
> `<par repeatCount="indefinite">` and from the `<seq repeatCount="indefinite">` inside each `priorityClass`.
> Priority behaviour (which class wins, pause/defer/stop rules) is likewise driven entirely by the
> `<priorityClass>` elements — media placed directly under `<excl>` without a `priorityClass` gets no priority
> handling.

## Exclusive playlists syntax

Exclusive playlists for a certain region are wrapped in `<excl>` tag:

```xml

<excl>
    <!-- All your priority playlists for a certain region -->
</excl>
```

Inside the `<excl>` tag you put as many `<priorityClass>` tags as you want, ordered by the priority — **the first
`<priorityClass>` in document order has the highest priority**, each following one is lower:

```xml

<par>

    <excl>
        <!-- All your priority playlists for a certain region ordered by priority -->
        <priorityClass>
            <par>
                <seq>
                    ... your media goes here ...
                </seq>
            </par>
        </priorityClass>

        <priorityClass>
            <par>
                <seq>
                    ... your media goes here ...
                </seq>
            </par>
        </priorityClass>
    </excl>
</par>
```

The `<priorityClass>` has a couple of attributes to define what should happen if they become active:

[More in the W3C standard.](https://www.w3.org/TR/SMIL3/smil-timing.html#adef-peers)

| Attributes | Default Value | Possible Values                      | Description                                                                                            |
|:-----------|:--------------|:-------------------------------------|:-------------------------------------------------------------------------------------------------------|
| peer       | never         | "stop"\| "pause"\| "defer"\| "never" | Controls how child elements of this priorityClass will interrupt one another                           |
| higher     | stop          | "stop"\| "pause"                     | Controls how elements with higher priority will interrupt child elements of this priorityClass         |
| lower      | defer         | "defer"\| "never"                    | Controls how elements defined with lower priority will interrupt child elements of this priorityClass. |

Note that the player's default values (above) differ from the W3C SMIL defaults — most notably `peer` defaults to
`never` and `higher` to `stop`. With `higher="pause"`, the interrupted content resumes where it left off once the
higher-priority content finishes. For `lower`, only `defer` and `never` are meaningful: a `lower="stop"` is treated as
`never` and `lower="pause"` as `defer` (lower-priority content is never allowed to stop or pause what is already
playing).

The validity of the `<priorityClass>` is defined by the `begin`, `end` and `expr` attributes on `<par>` elements inside
the `priorityClass:`

```xml

<excl>
    <!-- All your priority playlists for a certain region ordered by priority -->

    <!-- the first priorityClass will be active from 1st of Jan to 2nd of Jan -->
    <priorityClass higher="stop" lower="defer" peer="stop">
        <par begin="wallclock(2021-01-01T00:00:00)" end="wallclock(2021-01-02T00:00:00)">
            <seq>
                ... your media goes here ...
            </seq>
        </par>
    </priorityClass>

    <!-- the second priorityClass will be active any other day but 1st and 2nd of Jan -->
    <priorityClass higher="stop" lower="defer" peer="stop">
        <par>
            <seq repeatCount="indefinite" begin="0">
                ... your media goes here ...
            </seq>
        </par>
    </priorityClass>
</excl>
```

## Usage

### Play priority playlist every Monday

You can use [conditional expression](../scheduling/conditional-playback.md) to define active
priority playlist. In this example we are using `expr="adapi-weekday()=1"` which is `true` on Monday.

```xml

<excl>

    <priorityClass higher="stop" lower="defer" peer="stop">
        <par expr="adapi-weekday()=1">
            <seq repeatCount="indefinite">
                <video src="monday.mp4"/>
            </seq>
        </par>
    </priorityClass>

    <priorityClass higher="stop" lower="defer" peer="stop">
        <par>
            <seq repeatCount="indefinite" begin="0">
                <video src="ad1.mp4"/>
                <video src="ad2.mp4"/>
                <video src="ad3.mp4"/>
            </seq>
        </par>
    </priorityClass>

</excl>
```

### Conditional Playback Expressions

See [Conditional Playback](../scheduling/conditional-playback.md) to trigger playback by day of week, time, and
other expressions.

### Happy Hour Video once a day at specific time

This exclusive playlist contains two priority classes.

The first (higher) priority class contains a single video "happy-hour.mp4" that plays once a day, starting on 23:00 of
January 1, 2021, for one hour (see [Wallclock](../scheduling/wallclock-scheduling.md)
for detailed ISO-8601 specification)

The second (lower) priority class contains a sequential playlist, that begins at "zero" seconds (immediately as the
playlist is entered). While the sequence plays, when a higher priority class is triggered, the then playing item is "
paused" as the interrupting media object plays. After it finishes, the paused media object resumes.

This achieves the effect of looping three videos, and interrupting with another playlist once a day during "happy hour".
Wallclock syntax is covered in the [Wallclock scheduling guide](../scheduling/wallclock-scheduling.md).

```xml

<excl>

    <priorityClass higher="stop" lower="defer" peer="stop">
        <!-- P1D is equal to "once a day" or "in period of 1 day" — see the Wallclock scheduling guide -->
        <par begin="wallclock(R/2021-01-01T23:00:00/P1D)" end='wallclock(R/2021-01-01T23:59:59/P1D)'>
            <seq repeatCount="indefinite">
                <video src="happy-hour.mp4"/>
            </seq>
        </par>
    </priorityClass>

    <priorityClass higher="stop" lower="defer" peer="stop">
        <par>
            <seq repeatCount="indefinite" begin="0">
                <video src="ad1.mp4"/>
                <video src="ad2.mp4"/>
                <video src="ad3.mp4"/>
            </seq>
        </par>
    </priorityClass>

</excl>
```

### Priority playlists and regions

The following example creates two regions, both uses 50% of the screen. In the `leftZone` plays a standard `<seq>`
playlist with two
images.

In the `rightZone` plays `<excl>` playlist consists of 3 priority playlists.

- First `priorityClass` is triggered every day between 11:30-14:10 to take over the region and shows the lunch menu.
- Second `priorityClass` is triggered every day between 17:00-19:30 to take over the region and shows the dinner menu.
- Third `priorityClass` is triggered in the remaining times to show daily offer.

```xml

<smil>
    <head>
        <meta http-equiv="Refresh" content="60"/>
        <layout>
            <root-layout width="1920" height="1080"/>

            <!-- Creating two regions, each of them is 50% of screen width, dividing the screen in half -->
            <region regionName="leftZone" left="0" top="0" width="50%" height="100%" z-index="1"
            />
            <region regionName="rightZone" left="50%" top="0" width="50%" height="100%" z-index="1"
            />
        </layout>
    </head>

    <body>
        <!-- Parallel playback sequence, all below is happening at the same time -->
        <par repeatCount="indefinite">

            <!-- Standard sequential playlist of two images placed in the leftZone -->
            <seq repeatCount="indefinite">
                <img src="https://demo.signageos.io/smil/zones/files/img_1.jpg" dur="5s"
                     region="leftZone"/>
                <img src="https://demo.signageos.io/smil/zones/files/img_2.jpg" dur="5s"
                     region="leftZone"/>
            </seq>

            <!-- the rightZone is playing a standard sequence playlist [S] all the time,
                but on lunch time it switches to a priority playlist [A]
                and on dinner time it switches to a priority playlist [B]
            -->
            <par>
                <excl begin="0" repeatCount="indefinite">
                    <!-- Priority playlist [A] with lunch menu -->
                    <priorityClass higher="stop" lower="defer" peer="stop"> <!-- priorityClass is a wrapper -->
                        <par begin="wallclock(R/2021-01-01T11:30:00/P1D)" end="wallclock(R/2021-01-01T14:10:00/P1D)">
                            <seq repeatCount="indefinite">
                                <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
                                       region="rightZone"/>
                            </seq>
                        </par>
                    </priorityClass>

                    <!-- Priority playlist [B] with dinner menu -->
                    <priorityClass higher="stop" lower="defer" peer="stop">
                        <par begin="wallclock(R/2021-01-01T17:00:00/P1D)" end="wallclock(R/2021-01-01T19:30:00/P1D)">
                            <seq repeatCount="indefinite">
                                <video src="https://demo.signageos.io/smil/zones/files/video_2.mp4"
                                       region="rightZone"/>
                            </seq>
                        </par>
                    </priorityClass>

                    <!-- Standard sequence playlist [S] -->
                    <priorityClass higher="stop" lower="defer" peer="stop">
                        <par>
                            <seq begin="0" repeatCount="indefinite">
                                <img src="https://demo.signageos.io/smil/zones/files/img_3.jpg"
                                     dur="5s" region="rightZone"/>
                            </seq>
                        </par>
                    </priorityClass>
                </excl>
            </par>
        </par>
    </body>
</smil>
```
