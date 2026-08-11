---
sidebar_position: 1
---

# Triggers and Interactivity

Triggers allow defining set of rules for triggering specific `seq` or `par` playlist.

This page covers the shared trigger model. For the origin-specific setup, see:

- [Triggers using Keyboard](keyboard.md)
- [Triggers using mouse or touch display](mouse.md)
- [Triggers using widgets](widget.md)
- [Sensors](sensors.md)

## Defining Triggers

The `<triggers>` element defines a pool of individual `<trigger>` tags.

- whenever the `<condition>` is `TRUE`, trigger is set as *activate*.
- whenever the `<condition>` is `FALSE`, trigger is set as *deactivate*.

> The `id` of the `<trigger>` has to be unique and start with *trigger* key word - e.g. trigger1, trigger-my-content,
> triggerABC.

```xml

<head>
    <triggers>
        <trigger id="trigger1" condition="or">
            <!-- 
            If sensor - RFID antenna rfid1- emits
            that user picked up an RFID tag with ID 1 
            condition is set to TRUE 
            and trigger activated
             -->

            <!-- Trigger origin, usually defined in <sensor/> tag -->
            <!-- Data passed from origin sensor, in this case RFID tag ID -->
            <!-- user action emitted by the origin sensor -->
            <condition
                    origin="rfid1"
                    data="1"
                    action="picked"
            />
        </trigger>
        <!-- you can add as many triggers as you need -->
        <trigger id="trigger2" condition="or">
            <!-- also the number of conditions is limited only by device performance -->
            <condition origin="rfid1" data="2" action="picked"/>
            <condition origin="rfid1" data="3" action="picked"/>
            <condition origin="rfid5" data="4" action="picked"/>
            <condition origin="rfid6" data="5" action="picked"/>
        </trigger>
    </triggers>

</head>
```

## Sub-regions

To make sure triggers will work fine with other non triggered content in other regions, you **have to define** a
`sub-region` where the triggered playlists are going to be played.

Any triggered playlist will be played in the `trigger-sub-region1`.

> The `regionName` can be named as you want. There is no restriction.

More about the general usage of [Regions can be found here](../layout-playlist/layout-regions.md).
This is an advanced use case.

### Usage of the sub-regions

Sub-region is defined as a child tag of another `<region>`:

```xml
<region regionName="trigger-region">
    <region regionName="trigger-sub-region1"/>
</region>
```

1. The `trigger-sub-region1` can completely occupy the parent `<region>`:

```xml
<region regionName="trigger-region" left="10" top="10" width="1280" height="720">
    <!-- Single sub-region filling the parent region completely -->
    <region regionName="trigger-sub-region1" 
            left="0" 
            top="0" 
            width="100%" 
            height="100%"
    />
</region>
```

2. The `trigger-region` can be split into multiple `sub-regions`.

```xml

<region regionName="trigger-region" left="10" top="10" width="1280" height="720">
    <!-- Two sub-regions positioned relatively to the parent region -->
    <region regionName="trigger-sub-region1"
            left="0"
            top="0"
            width="50%"
            height="100%"
    />
    <region regionName="trigger-sub-region2"
            left="50%"
            top="0"
            width="50%"
            height="100%"
    />
</region>
```

Having multiple `sub-regions` allows you to play **multiple triggered content** with a dynamic location. The example
flow of the dynamically assigning sub-regions is as follows:

1. first, `trigger2` will start playback in the first available sub-region of the `trigger-region` ->
   `trigger-sub-region1`
1. secondly, `trigger1` will be initiated while still having `trigger2` activated -> the playlist for `trigger1` will be
   automatically assigned to the `trigger-sub-region2`

> Triggered playlist is always looking for the first available (empty) sub-region. If no sub-region is available (all
> are occupied by the previously triggered playlists), it overrides the first sub-region. A sub-region counts as
> available when nothing *trigger- or dynamic-initiated* is playing in it — regular content is simply displaced. All
> media of one trigger activation stay together in the sub-region chosen when the trigger fired.

## Triggering content

To trigger content by the pre-defined `triggers` use trigger `id` in the `begin` attribute of a `<seq>` element
(wrapped in a `<par>`, as in the examples below — the `begin` must sit on the inner `<seq>`, not on a top-level
`<par>`).

For sensor (RFID) triggers, the triggered playlist is automatically stopped whenever the condition defined in
`<head>` is no longer `TRUE` (e.g. the tag is placed back). Keyboard, mouse, and widget triggers stop on their `dur`
or `repeatCount` limit, on an explicit `end` attribute, or when another trigger claims the same sub-region (while
free sub-regions remain, a later trigger plays side by side in its own sub-region instead of cancelling the first).

> For media and other elements **always set region attribute to the parent one**. Never use sub-regions in the region
> attribute.

```xml

<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  -->
    <seq begin="trigger1">
        <video src="smil/zones/files/video_3.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
        <video src="/smil/zones/files/video_3.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>

<par>
<!-- referencing <trigger id="trigger2"> defined in <head>  -->
<seq begin="trigger2">
    <video src="smil/samples/assets/landscape1.mp4"
           region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
    </video>
</seq>
</par>
```

## Trigger duration

If you need the triggered content to play more than one time, you can adjust the number of playback by using
`repeatCount`:

```xml

<par>
    <!-- referencing <trigger id="trigger2"> defined in <head>  -->
    <seq begin="trigger2" repeatCount="3">
        <video src="smil/samples/assets/landscape1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

Or you can specify `dur` attribute to determine exactly how long should be trigger playing. Dur is specified in seconds
(also accepts `indefinite`).

```xml

<par>
    <!-- referencing <trigger id="trigger2"> defined in <head>  -->
    <seq begin="trigger2" dur="30">
        <video src="smil/samples/assets/landscape1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

Notes on duration:

- With `dur`, the trigger playlist **loops** until the duration expires — it does not stop after a single pass.
- When both `dur` and `repeatCount` are set, `dur` takes precedence.
- For keyboard, mouse, and widget triggers, re-firing the trigger while it is already playing **extends** the
  duration (the countdown restarts from the latest event).
- For sensor (RFID) triggers, `dur` is ignored — use `repeatCount`, or rely on the condition turning `FALSE`.

## Cross-trigger cancellation

A trigger playlist's `end` attribute may name a **different** trigger. When that other trigger fires, the currently
playing playlist is cancelled — this works for keyboard, mouse, and widget triggers (not for sensor or sync-failover
triggers):

```xml

<par>
    <!-- trigger1 starts this content; firing trigger2 stops it -->
    <seq begin="trigger1" end="trigger2" dur="indefinite">
        <video src="smil/samples/assets/landscape1.mp4"
               region="trigger-region">
        </video>
    </seq>
</par>
```

The cancelling trigger (`trigger2` above) does not need any playlist of its own — a trigger declared in `<head>` that
never appears in a `begin` attribute acts as a pure "stop button": firing it cancels the playlist(s) that name it in
`end`, and does nothing when none are playing. Setting `end` to the *same* id as `begin` makes the trigger toggle
itself off when fired again — the triggered playlist is cancelled and the SMIL Player resumes the original playback:

```xml
<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  -->
    <seq begin="trigger1" end="trigger1" repeatCount="4">
        <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
               region="trigger-region">
        </video>
    </seq>
</par>
```
