---
sidebar_position: 5
---

# Supported SMIL Features

[Smil standard](https://www.a-smil.org/index.php/Main_Page)\
[w3c docs](https://www.w3.org/TR/SMIL3/)

## Sections

### SMIL Media Objects
[A-smil reference](https://www.a-smil.org/index.php/SMIL_Media_Objects)
* All media objects are supported except `<audio>` — see [Not supported](#not-supported) below.
* Scrolling text is supported via the `ticker` element (see the [Ticker guide](../guides/media/ticker.md)).
* Src can be specified with relative path or absolute path. If relative path is specified smil player will combine it with 
actual path to smil file to get absolute one.
* Duration is specified in seconds, either with `s` string or without. Or `indefinite` string.

#### Our changes/limitations
* `z-index` can be specified directly on element (images, widgets, tickers — not videos, which render on the native
video plane) — see [`z-index`](./element-attributes.md#z-index).

#### Example
```xml
<ref src="http://server/index.html" type="text/html" dur="indefinite" />
<video src="ad1.mpg" dur="5" />
<img src="https://some-server.com/ad2.jpg" dur="5s" />
```

### SMIL Playlists
[A-smil reference](https://www.a-smil.org/index.php/SMIL_Playlists)
* `seq`, `par`, `excl` and `priorityClass` are supported. Deviations from the standard: `excl` relies on its
`priorityClass` children for exclusivity (its own `begin`/`repeatCount` are ignored — wrap it in a `par`), the
priorityClass defaults differ (see the [Priority guide](../guides/layout-playlist/priority-playlist.md)), and `audio` is
not played.

### SMIL Scheduling
[A-smil reference](https://www.a-smil.org/index.php/SMIL_Scheduling)
* All tags are supported and behave by standard specification.

### Layout
[A-smil reference](https://www.a-smil.org/index.php/Layout)
* We are using layout by standard specification.
* Dimensions and positions can be specified by absolute value or by percentages which are computed from display resolution.
* region name is specified by [`regionName` or `xml:id`](./element-attributes.md#regionname--xmlid) attribute

#### Our changes/limitations
* we use region definition to specify if content in that region should be synchronized or not = [`sync="true"`](./element-attributes.md#sync)
* for triggers we use nested regions. See example below or our docs. But basically region has several nested regions, with
dimensions derived from parent region and the trigger is dynamically assigned to one of the free nested regions. If none is free, trigger will be assigned to the first one.
* `fit` values (`fill`/`meet`/`meetBest`/`cover`) are documented in full in [`fit`](./element-attributes.md#fit).

#### Example
```xml
<region regionName="bottom" left="0" top="1574" width="1080" height="346" z-index="2" sync="true" backgroundColor="#ffffff"/>
<region regionName="main" left="0" top="0" width="1080" height="1920" z-index="1" backgroundColor="#ffffff"/>
<region regionName="trigger" left="0" top="0" width="1080" height="1920" z-index="0" backgroundColor="#ffffff">
    <region regionName="fullScreenTrigger" left="0" top="0" width="1080" height="1920" z-index="0" backgroundColor="#ffffff"/>
</region>
```

### Interactivity
[A-smil reference](https://www.a-smil.org/index.php/Interactivity)
* For interactivity, we use functionality called triggers. Currently, we have keyboard, mouse/touch, widget-emitted,
nexmosphere RFID sensor, and sync failover triggers, plus network-driven dynamic playlists (`emitDynamic`).
* We handle triggers completely differently than the a-smil standard — see the [Triggers overview](../guides/triggers/overview.md).

### Video input
[A-smil reference](https://www.a-smil.org/index.php/Video_input)
* We do not use this functionality; you can specify video input by URL (relative or absolute), by stream URL, or by HDMI input URL — see [Streams and Video Inputs](../guides/media/streams.md).

### Linking SMIL
[A-smil reference](https://www.a-smil.org/index.php/Linking_SMIL)
* Not supported.

### Screen on/off
[A-smil reference](https://www.a-smil.org/index.php/Screen_on/off)
* Not supported.

### Sync Playback
[A-smil reference](https://www.a-smil.org/index.php/Sync_Playback)
* Handled differently, via an ACK-based coordination protocol. With [`syncServerUrl`](./applet-config.md#syncserverurl)
configured the devices coordinate through a sync server (applet-synchronizer); without it they use local-network
peer-to-peer. [`syncGroupName`](./applet-config.md#syncgroupname) is required.
* The setup has several moving parts — see [Playback Synchronization](../guides/synchronization/playback-synchronization.md) for the full walkthrough.
* Which media should be synced among devices is specified in the region definition (see the layout section). All content within such a region will be synchronized.

### AnyTiles
[A-smil reference](https://www.a-smil.org/index.php/AnyTiles)
* Not supported.

### Pull mode
[A-smil reference](https://www.a-smil.org/index.php/Pull_mode)
* We are using pull mode by standard specification.

#### Our changes/limitations
All `<meta>`-level update-control attributes (`onlySmilUpdate`, `checkBeforePlay`, `checkAheadCount`,
`contentRefresh`, `smilFileRefresh`, `fallbackToPreviousPlaylist`, `timeOut`, `skipContentOnHttpStatus`,
`updateContentOnHttpStatus`, `skipPlaybackOnHttpStatus`, `defaultRepeatCount`, `defaultTransition`,
`reportFileLimit`), the per-element update attributes (`updateCheckUrl`, `updateCheckInterval`,
`allowLocalFallback`), and the per-element playability gate (`playCheckUrl`, `playCheckSkipOnError`) are documented
in full in the [`<meta>` Attribute Reference](./meta-attributes.md) and the
[Element Attribute Reference](./element-attributes.md).

#### Example
```xml
<meta http-equiv="Refresh" content="10" onlySmilUpdate="true"/>
<meta http-equiv="Refresh" content="60" contentRefresh="120" smilFileRefresh="30" fallbackToPreviousPlaylist="true"/>
```

### Prefetch
[A-smil reference](https://www.a-smil.org/index.php/Prefetch)
* We don't use this tag during SMIL processing.

### Reporting
[A-smil reference](https://www.a-smil.org/index.php/Reporting)
* We use our FrontApplet `command.dispatch` for reporting. It has to be allowed in smil file.
* Enabling and endpoint configuration (`log`/`type`/`endpoint`, `reportUrl`) are documented in the
[`<meta>` Attribute Reference](./meta-attributes.md#log--type--endpoint) and
[Applet Configuration Reference](./applet-config.md#reporturl). Event and payload shapes are documented in
[Reporting Events & Payloads](./reporting-payloads.md).

#### Example
```xml
<meta log="true" />
<meta log="true" type="manual" endpoint="https://custom.endpoint.com/reports"/>
```

### Wallclock
[A-smil reference](https://www.a-smil.org/index.php/Wallclock)
* We are using wallclock by standard specification. See docs or tests in `playlistWallclock.spec.ts` for details.

#### Our changes/limitations
* only supported periodical attribute is `P1D` (once a day).

### Transition
[A-smil reference](https://www.a-smil.org/index.php/Transition)
* We are using transition by standard specification

#### Our changes/limitations
* supported transitions are `crossfade` (images and widgets) and `billboard` (images only) — see the
[Transitions](../guides/layout-playlist/transitions.md) guide.
* transition name is specified by `transitionName` or `xml:id` attribute.
* a playlist-wide default can be set with [`defaultTransition`](./meta-attributes.md#defaulttransition).

### Conditional play
[A-smil reference](https://www.a-smil.org/index.php/Conditional_play)
* Conditional expressions are fully supported. Simple as well as nested ones. For more details see test files `conditionalSimple.spec` and `conditionalAdvanced.spec`

#### Our changes/limitations
* `&lt;` and `&gt;` does not have to be encoded, you can use directly `<`, `>`
* `adapi-` prefix is not necessary in conditional attributes.

## Not supported

### `<audio>` playback

> The `<audio>` tag is **not supported** by signageOS SMIL Player. Audio elements are parsed and their files are
> downloaded into storage, but they are never played — playback silently skips them. The playback functionality is
> coded, but it's commented out due to interaction with the audio of videos. Avoid `<audio>` elements in
> production playlists; their files only consume bandwidth and device storage.

```xml
<audio src="music.mp3" />
```

### Sound Volume Control (`soundLevel`)

> The `soundLevel` attribute is **not implemented** — it has no effect on playback volume for any media type.

```xml
<video src="ad1.mp4" soundLevel="20%" />
```

### Video layering

* you cannot layer videos on top of each other
