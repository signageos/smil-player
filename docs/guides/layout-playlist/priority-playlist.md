---
sidebar_position: 4
---

# Exclusive/priority playlist

The exclusive playlist allows up to one of its children to play. The start of one media object causes the currently
playing item to either pause or stop.

The priorityClass tag further defines interrupt priorities and behavior (pause, defer, or stop) of media objects when
interrupts occur.

The starting of a media object may be triggered by an event such as a key press or
a [Wallclock](https://docs.signageos.io/hc/en-us/articles/4405244572178) time, as the following sample code illustrates.

## Exclusive playlists syntax

Exclusive playlists for a certain region are wrapped in `<excl>` tag:

```xml

<excl>
    <!-- All your priority playlists for a certain region -->
</excl>
```

Inside the `<excl>` tag you put as many `<priorityClass>` tags as you want, ordered by the priority:

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
| peer       | stop          | "stop"\| "pause"\| "defer"\| "never" | Controls how child elements of this priorityClass will interrupt one another                           |
| higher     | pause         | "stop"\| "pause"                     | REAControls how elements with higher priority will interrupt child elements of this priorityClassDME   |
| lower      | deffer        | "defer"\| "never"                    | Controls how elements defined with lower priority will interrupt child elements of this priorityClass. |

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

You can use [conditional expression](https://docs.signageos.io/hc/en-us/articles/4405241217810) to define active
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

Trigger playback based on day of the week, time and other expressions

### Happy Hour Video once a day at specific time

This exclusive playlist contains two priority classes.

The first (higher) priority class contains a single video "happy-hour.mp4" that plays once a day, starting on 23:00 of
January 1, 2021, for one hour (see [Wallclock](https://docs.signageos.io/knowledge-base/signageos-smil-docs-wallclock)
for detailed ISO-8601 specification)

The second (lower) priority class contains a sequential playlist, that begins at "zero" seconds (immediately as the
playlist is entered). While the sequence plays, when a higher priority class is triggered, the then playing item is "
paused" as the interrupting media object plays. After it finishes, the paused media object resumes.

This achieves the effect of looping three videos, and interrupting with another playlist once a day during "happy hour".

```xml

<excl>

    <priorityClass higher="stop" lower="defer" peer="stop">
        <!-- 
          P1D is equal to "once a day" or "in period of 1 day"
          Learn more on Wallclock page https://docs.signageos.io/knowledge-base/signageos-smil-docs-wallclock
        -->
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
        <!-- Paralel playback sequence, all below is happening at the same time -->
        <par repeatCount="indefinite">

            <!-- Standard sequential playlist of two images placed in the leftZone -->
            <seq repeatCount="indefinite">
                <img src="https://demo.signageos.io/smil/zones/files/img_1.jpg" dur="5s"
                     region="leftZone">
                    <param name="cacheControl" value="auto"/>
                </img>
                <img src="https://demo.signageos.io/smil/zones/files/img_2.jpg" dur="5s"
                     region="leftZone">
                    <param name="cacheControl" value="auto"/>
                </img>
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

## FAQ

Important notice: to make the priority playlist work, you need to wrap the whole `<excl>` section with `<par>` tag.
