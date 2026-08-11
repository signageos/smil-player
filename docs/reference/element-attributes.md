---
sidebar_position: 2
---

# Element Attribute Reference

Attributes below apply directly to playlist elements (`<video>`, `<img>`, `<ref>`, `<ticker>`, `<seq>`, `<par>`) and
to `<region>`/`<root-layout>` layout elements — not to the SMIL `<head>`'s `<meta>` tags (for those, see the
[`<meta>` Attribute Reference](./meta-attributes.md)). Entries are grouped by concern: common playback, streams and
inputs, update control, the playability gate, proof-of-play reporting, ticker styling, and region layout.

## Common playback attributes

These apply to `<video>`, `<img>`, `<ref>`, parsed `<audio>`, and `<seq>` where noted per attribute.

### src

**Type:** string (URL) · **Default:** none (required) · **Applies to:** `<video>`, `<img>`, `<ref>`, `<audio>`, `<ticker>`

The SMIL Player treats URLs with different query parameters as separate files for caching purposes. This means that
each unique combination of URL and query parameters will be cached independently.

When the SMIL Player encounters URLs with query parameters, it includes those parameters in the cache file naming.
This ensures that different content variations can be served using the same base URL, each variation is cached
separately, and query parameters can be used for tracking, versioning, or dynamic content selection.

When using query parameters in SMIL files, remember to properly XML-encode the ampersand character: use `&amp;`
instead of `&` between query parameters.

```xml
<!-- These URLs will be cached as separate files -->
<video src="https://example.com/content?adunit=ABC123&amp;id=1" region="main"></video>
<video src="https://example.com/content?adunit=ABC123&amp;id=2" region="main"></video>
```

Used in: [Content Caching](../guides/content-management/content-caching.md)

### dur

**Type:** number (seconds, decimals allowed) or `indefinite` · **Default:** `5` seconds for images/tickers; plays to
natural end for video when omitted · **Applies to:** `<video>`, `<img>`, `<ticker>`, `<ref>`

For images: the `dur` attribute specifies a duration of the still image during playback. The valid value is either
with or without `s`econds - `dur="10"` `dur="10s"`. Decimals are allowed (e.g. `dur="10.45s"`), and `dur="indefinite"`
keeps the image on screen. When `dur` is omitted, a default of **5 seconds** is used. SMIL clock-values like
`dur="3000ms"` or `dur="01:02:03"` are **not** supported and will be misread as seconds.

For video: if you need to play part of your video, you can define the `dur` attribute — it will cut the video
playback after the defined number of seconds. Without `dur`, the video plays until its natural end. Note the `dur`
value must be a plain number of seconds (optionally with the `s` suffix) — the same clock-value restriction above
applies.

Used in: [Image](../guides/media/images.md), [Video](../guides/media/videos.md)

### region

**Type:** string (region name reference) · **Default:** root-layout region · **Applies to:** any playable element

The `region` attribute assigns the element to a `<region>` defined in the SMIL `<layout>`, referenced by its
`regionName` (or `xml:id`). If media has no region assigned, smil player will assign root-layout region to media
definition.

Used in: [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)

### fit

**Type:** enum (`fill` \| `meet` \| `meetBest` \| `cover`) · **Default:** `fill` · **Applies to:** `<img>`; also
settable on `<region>` as a default for its media

The `fit` attribute defines how to position image within the region. Options are:

| Fill option | Description |
|:------------|:------------|
| `fill` | Default option. Shrink or stretch the content to completely fill the area (without preserving aspect ratio) |
| `meet` | Scale the content while preserving aspect ratio until one of the dimensions meets that of the area. Similar to css property `object-fit: contain` |
| `meetBest` | Not implemented, behaves the same as `meet` |
| `cover` | Image is sized to maintain its aspect ratio while filling the element's entire content box. The object will be clipped to fit. Similar to css property `object-fit: cover` |

Unknown `fit` values fall back to `fill`. The `fit` attribute may also be set on the `<region>` element as a default
for all its media, and can be overridden per media element.

```xml
<!-- letterboxed to preserve aspect ratio; meetBest behaves the same as meet -->
<img src="portrait.jpg" dur="5s" region="main" fit="meet" />
```

Used in: [Image](../guides/media/images.md), [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)

### z-index

**Type:** number · **Default:** none · **Applies to:** `<img>`, widgets, tickers (not `<video>`); `<region>`

When you need to overlap images, you can assign `z-index` directly to the `<img>` element (e.g. `z-index="5"`) —
note this works for images, widgets, and tickers, but not for videos.

On a `<region>`, `z-index` sets the stacking order between overlapping regions.

```xml
<!-- logo overlaps the photo; higher z-index wins -->
<img src="photo.jpg" dur="10s" region="main" z-index="1" />
<img src="logo.png" dur="10s" region="main" z-index="5" />
```

Used in: [Image](../guides/media/images.md), [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)

### transIn

**Type:** string (transition ID) · **Default:** none · **Applies to:** `<img>`, widgets

The `transIn` attribute on an `<img>` or widget element references the `xml:id`/`transitionName` of a `<transition>`
defined in the SMIL `<layout>`.

Smil player offers an option to create a crossFade or billboard transition between two images or image and widget.
If there is a video after image in the playlist, the transition will not be displayed. Transition image -> widget
works only for crossFade transition. Billboard transition supports only image -> image use case.

The transition plays when the **next** element in the same region is an image or widget — when a video follows, the
transition is skipped (videos render on a different plane).

Used in: [Transitions](../guides/layout-playlist/transitions.md)

### repeatCount

**Type:** positive integer \| `indefinite` · **Default:** `1` (plays once) — see
[`defaultRepeatCount`](./meta-attributes.md#defaultrepeatcount) to change this default playlist-wide ·
**Applies to:** `<seq>`, `<par>`

When a `<seq>` or `<par>` has no `repeatCount`, it plays once.

```xml
<seq repeatCount="indefinite">
    <video src="ad1.mpg" region="main"/>
    <video src="ad2.mpg" region="main"/>
    <img src="ad3.png" dur="5s" region="main"/>
</seq>
```

Loop 2 videos and 1 JPEG indefinitely.

```xml
<seq repeatCount="indefinite">
    <video src="ad1.mpg" region="main"/>

    <seq repeatCount="2">
        <video src="ad2.mpg" region="main"/>
        <img src="ad3.png" dur="5s" region="main"/>
    </seq>
</seq>
```

Plays the sequence: ad1, ad2, ad3, ad2, ad3 and repeats the entire sequence endlessly.

> When mixing nested `<seq>`/`<par>` groups with plain media inside one `<seq>`, keep the nested groups **next to
> each other** (contiguous). Structure tags of the same name that are separated by media elements are merged during
> XML parsing, which changes the playback order.

Used in: [Sequence Playlist](../guides/layout-playlist/sequence-playlist.md)

### playMode

**Type:** enum (`random` \| `random_one` \| `one`) · **Default:** none (normal in-order playback) ·
**Applies to:** `<seq>`

SMIL player supports three types of play modes:

- **random** - In every time player reaches segment, the SMIL player shuffles the playlist and plays the whole
  playlist in a random order.
- **random_one** - In every time player reaches segment, the SMIL player randomly picks one element from the
  playlist and plays only that element.
- **one** - In every time player reaches segment, the SMIL player plays only one element from the playlist. In the
  next playback cycle, the SMIL player will pick the element that comes directly after the previous one. This
  behavior continues until the end of the playlist, after which it will start again from the beginning.

The value is case-insensitive; an unknown value plays the whole playlist in normal order.

Play mode is specified in the `playMode` attribute of the `seq` element. The children may be plain media elements,
or `<seq>`/`<par>` groups when one "element" should consist of several media played together — with `one` and
`random_one`, each child group counts as a single pick.

Full behavioral detail (the `random` nested-children shuffling limitation, synchronized-playback interaction) lives
in the linked guide.

```xml
<!-- each cycle picks ONE random image from the three -->
<seq playMode="random_one" repeatCount="indefinite">
    <img src="ad1.jpg" dur="5s" region="main" />
    <img src="ad2.jpg" dur="5s" region="main" />
    <img src="ad3.jpg" dur="5s" region="main" />
</seq>
```

Used in: [Random playback](../guides/layout-playlist/random-order-playback.md)

### preload

**Type:** boolean · **Default:** `true` · **Applies to:** widgets (`<ref>`)

By default widgets are preloaded — the iframe is prepared before the widget's turn. Set `preload="false"` to load
the widget freshly each time it plays, for widgets that must re-initialise on every showing.

```xml
<ref src="widget.wgt" type="application/widget" dur="30s" region="main" preload="false" />
```

Used in: [Widgets](../guides/media/widgets.md)

### begin / end / expr

**Type:** string · **Default:** none (immediate start / no end / always true) · **Applies to:** any playable
element (`<video>`, `<img>`, `<ref>`, `<seq>`, `<par>`, `<excl>`, `<ticker>`)

`begin` / `end` accept a time offset, a `wallclock(...)` expression, or (on `begin`) a trigger ID. Full wallclock
syntax (supported ISO-8601 forms, the `P1D`-only repeat restriction) is documented in the
[wallclock scheduling guide](../guides/scheduling/wallclock-scheduling.md).

`expr` gates playback on a conditional expression — only when the expression provided evaluates to `true` is the
associated media item played. The supported expression functions are documented in the
[conditional playback guide](../guides/scheduling/conditional-playback.md).

Trigger placement: to trigger content by the pre-defined triggers, use the trigger `id` in the `begin` attribute of a
`<seq>` element (wrapped in a `<par>` — the `begin` must sit on the inner `<seq>`, not on a top-level `<par>`).

Used in: [Wallclock Scheduling](../guides/scheduling/wallclock-scheduling.md), [Conditional Playback](../guides/scheduling/conditional-playback.md), [Triggers and Interactivity](../guides/triggers/overview.md)

## Streams and inputs

### isStream

**Type:** boolean (presence-triggered) · **Default:** absent (not a stream) · **Applies to:** `<video>`

For signageOS SMIL Player to correctly recognize streams, it is necessary to include `isStream="true"` in video tag.

> **Warning:** the mere *presence* of the `isStream` attribute marks the element as a stream — `isStream="false"` is
> also treated as a stream. Remove the attribute entirely for regular video files.

Streams are played live from the network; they are never downloaded, cached, or update-checked. If no `dur`
attribute is specified, the stream will play indefinitely (until the stream disconnects or errors, at which point
the playlist moves on).

Used in: [Streams and Video Inputs](../guides/media/streams.md#network-streams)

### `internal://` video input sources

**Type:** string (URL scheme value for `src`) · **Default:** n/a · **Applies to:** `<video>` (requires
`isStream="true"`)

| Value | Description |
|-------|-------------|
| `internal://hdmi` | HDMI |
| `internal://dp` | DisplayPort |
| `internal://dvi` | DVI |
| `internal://pc` | PC or VGA |

Note: video inputs are shown live; they are not affected by the `videoBackground` option and are never pre-prepared
in the background.

Used in: [Streams and Video Inputs](../guides/media/streams.md#hdmi--dp--dvi-inputs)

## Update control

These attributes can be placed directly on any media element (`<video>`, `<img>`, `<ref>`).

### updateCheckUrl

**Type:** string (URL) · **Default:** same as `src` · **Applies to:** `<video>`, `<img>`, `<ref>`

Custom URL used for the HEAD update-check request instead of the element's `src`. This is useful when you have a
lightweight endpoint that returns update information without serving the full file.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### updateCheckInterval

**Type:** number (seconds) · **Default:** from the `<meta>` tag · **Applies to:** `<video>`, `<img>`, `<ref>`

Per-element refresh interval in seconds. Overrides the global refresh interval defined in the `<meta>` tag for this
specific element. Only applies to interval-based polling — when `checkBeforePlay="true"` is set, media is checked
right before playback instead and this attribute has no effect.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### allowLocalFallback

**Type:** boolean · **Default:** `true` · **Applies to:** `<video>`, `<img>`, `<ref>`

When set to `true`, the player keeps playing the cached version of the file if the update-check request fails. When
set to `false`, the element is skipped entirely when the update check fails with a **network/transport error** or a
**5xx server error**. An update check that *times out* (see `<meta timeOut>`) plays from cache in both modes.

Used in: [Updating Content](../guides/content-management/updating-content.md)

## Playability gate

Strict per-attribute status contract only. Operational guidance (CORS, sync-group contract, priority interplay) is
covered in [Playability Gate](../guides/content-management/playability-gate.md).

### playCheckUrl

**Type:** string (absolute URL) · **Default:** none · **Applies to:** `<video>`, `<img>`, `<ref>`, tickers, and
streams. Intro media is not gated.

A second per-element URL whose **sole** job is deciding whether the element plays. Right before each play, the
player sends a GET request to `playCheckUrl`; only the response status code is examined (the body is ignored). If
the status is listed in `<meta skipPlaybackOnHttpStatus>`, the element is skipped **for this pass only**. Everything
else about the element is untouched — downloads, caching, update checks (`src`/`updateCheckUrl`), and version
detection run exactly as without the attribute.

**`<meta skipPlaybackOnHttpStatus>` is required** — without it (or with an empty value) the gate is inert: the
element always plays, no gate request is sent, and the player logs a one-time debug warning.

- **Skip is per-pass, recovery is automatic.** The gate is re-checked before every play; the moment the server
  answers with an unlisted status again, the element plays. No persistent skip state is kept.
- **Fail-open by default.** Network error, timeout, or CORS failure → the element plays from cache. An HTTP status
  *not* in the list — including 5xx — also plays. An explicitly listed status always skips, and unlisted non-5xx
  statuses always play.
- **Activates on its own.** The attribute works with or without `checkBeforePlay`. With `checkBeforePlay` +
  `checkAheadCount`, updates ride the lookahead while the gate still fires inline right before play — two
  independent request channels (updates use HEAD, the gate uses GET). Expect the gate to add roughly one round-trip
  before each gated play.
- **Must be an absolute URL.** A relative `playCheckUrl` is *not* resolved against the SMIL file (unlike `src`); it
  would resolve against the player's own origin and silently misbehave — fail-open on some platforms, or gate
  against an unrelated endpoint's status on others.
- **Response handling.** The response body is transferred and then discarded — the status is only evaluated after
  the full body arrives, so keep gate responses small (an empty body or a 204 is ideal). A listed status whose body
  cannot finish downloading within `<meta timeOut>` times out and **fail-opens** (the element plays) — or skips,
  with `playCheckSkipOnError="true"` (a timeout is a transport error).
- **Redirects resolve transparently** — the *final* status after redirects is classified; listing 3xx has no
  effect.
- **No proof-of-play** is emitted for a gate-skipped pass, and `playCheckUrl` never appears in report payloads.

Used in: [Playability Gate](../guides/content-management/playability-gate.md)

### playCheckSkipOnError

**Type:** boolean · **Default:** `false` · **Applies to:** same elements as `playCheckUrl`; only meaningful with
`playCheckUrl`

Elements that must never play without an explicit green light can set `playCheckSkipOnError="true"` next to
`playCheckUrl`: then a gate transport error **or an unlisted 5xx** (500–599, "server broken") skips the pass
instead of the default fail-open. An explicitly listed status always skips regardless of the attribute, and
unlisted non-5xx statuses always play. Prefer this attribute over listing 5xx codes in `skipPlaybackOnHttpStatus` —
the global list would force outage-skips on *every* gated element, while the attribute decides per element. Like
every gate decision the skip is per-pass: the element returns the moment the gate answers normally again.
`playCheckSkipOnError` has no effect without `playCheckUrl`, and none while the gate is inert (missing
`skipPlaybackOnHttpStatus` meta).

Used in: [Playability Gate](../guides/content-management/playability-gate.md)

## Proof of play

All `pop*` attributes are optional — a report is sent for every media element whenever proof-of-play logging
(`type="manual"`) is active. Attributes you set are included in the report; attributes you omit are left out of the
payload entirely.

### popName

**Type:** string · **Default:** none · **Applies to:** any media element with proof-of-play reporting enabled

The report's `name` field is set by the player itself (`media-playback`, `media-download`, `playlist-download`,
`playlist-playback`) and identifies the event type — the `popName` attribute value is not carried in custom-endpoint
payloads. Use `popCustomId` or `popFileName` to identify individual media items.

Used in: [Proof of Play](../guides/reporting/proof-of-play.md)

### popType

**Type:** string (`"video"` \| `"image"` \| `"html"` \| `"custom"`) · **Default:** none · **Applies to:** any media
element with proof-of-play reporting enabled

Type label included in the report (`"video"`, `"image"`, `"html"`, or `"custom"`).

Used in: [Proof of Play](../guides/reporting/proof-of-play.md)

### popCustomId

**Type:** string · **Default:** none · **Applies to:** any media element with proof-of-play reporting enabled

Custom identifier passed through to the report as `customId`.

Used in: [Proof of Play](../guides/reporting/proof-of-play.md)

### popFileName

**Type:** string · **Default:** none · **Applies to:** any media element with proof-of-play reporting enabled

File name included in the report.

Used in: [Proof of Play](../guides/reporting/proof-of-play.md)

### popTags

**Type:** string (comma-separated list) · **Default:** none · **Applies to:** any media element with
proof-of-play reporting enabled

The `popTags` attribute allows you to specify multiple tags separated by commas, which will be sent as an array in
the report — the player appends the content's final URL as the last array entry.

For the native signageOS PoP payload (no custom endpoint configured), the `tags` array includes the `popTags` values
followed by the content's final URL and an ISO timestamp.

Used in: [Proof of Play](../guides/reporting/proof-of-play.md)

### reportMode

**Type:** enum (`immediate` \| `batch`) · **Default:** `immediate` · **Applies to:** individual media elements
(`<video>`, `<img>`, `<ref>`, etc.)

By default, reports are sent immediately via HTTP POST as each media event occurs. The `reportMode` attribute lets
you override this on a per-element basis, choosing between immediate delivery and batched offline storage.

- **`immediate`** (default) — Reports are sent via HTTP POST to the configured endpoint as they occur. This is the
  default behavior when `reportMode` is omitted.
- **`batch`** — Playback reports are saved to local CSV storage and uploaded in bulk. This reduces network traffic
  and is useful for high-frequency playlists or unreliable connections.

`reportMode` applies to **playback** reports only; download reports are always sent immediately.

Add the `reportMode` attribute directly to any media element in your SMIL playlist. You can mix modes within the
same playlist:

```xml
<seq>
    <!-- This video's playback reports are batched to CSV and uploaded in bulk -->
    <video src="https://example.com/video.mp4"
           region="main"
           popName="promo-video"
           reportMode="batch"/>

    <!-- This image's reports are sent immediately (explicit) -->
    <img src="https://example.com/banner.jpg"
         dur="10s"
         region="main"
         popName="banner"
         reportMode="immediate"/>

    <!-- This image's reports are also sent immediately (default when omitted) -->
    <img src="https://example.com/logo.jpg"
         dur="5s"
         region="main"
         popName="logo"/>
</seq>
```

Used in: [Setting Up Reporting](../guides/reporting/setup.md)

## Ticker attributes

Tickers also support the per-element update and proof-of-play attributes documented above.

### fontName

**Type:** string · **Default:** browser fallback font · **Applies to:** `<ticker>`

Name of the font used for the text. The font is loaded from **Google Fonts** at runtime, so the device needs network
access for a custom font (otherwise the browser fallback font is used). A `-Bold` suffix (e.g. `Roboto-Bold`)
selects the family and renders it bold.

Used in: [Ticker](../guides/media/ticker.md)

### fontSize

**Type:** number (px) · **Default:** 60% of the region height · **Applies to:** `<ticker>`

Size of the text in pixels. Defaults to 60% of the region height.

Used in: [Ticker](../guides/media/ticker.md)

### fontColor

**Type:** CSS color · **Default:** none · **Applies to:** `<ticker>`

Color of the text.

Used in: [Ticker](../guides/media/ticker.md)

### linearGradient

**Type:** string (CSS gradient stops) · **Default:** none · **Applies to:** `<ticker>`

Gradient of the ticker background, e.g. `linearGradient="#ff0000 0%, #aa9999 100%"`.

Used in: [Ticker](../guides/media/ticker.md)

### linearGradientAngle

**Type:** number (degrees) · **Default:** `0` · **Applies to:** `<ticker>`

Angle of the gradient in degrees (default `0`).

```xml
<ticker region="bottom" dur="20s" fontColor="#ffffff"
        linearGradient="#ff0000 0%, #aa9999 100%" linearGradientAngle="45">
    <text>Gradient runs at 45 degrees.</text>
</ticker>
```

Used in: [Ticker](../guides/media/ticker.md)

### backgroundColor

**Type:** CSS color · **Default:** none · **Applies to:** `<ticker>`

Solid background color of the ticker strip; ignored when `linearGradient` is set.

```xml
<ticker region="bottom" dur="20s" fontColor="#ffd800" backgroundColor="#000000">
    <text>Solid black strip behind the text.</text>
</ticker>
```

Used in: [Ticker](../guides/media/ticker.md)

### indentation

**Type:** number (px) · **Default:** `100` · **Applies to:** `<ticker>`

Initial space between the text and the edge of the screen, in pixels (default `100`).

Used in: [Ticker](../guides/media/ticker.md)

### velocity

**Type:** number (px/s) · **Default:** `100` · **Applies to:** `<ticker>`

Speed of the text scrolling in pixels per second (default `100`).

Used in: [Ticker](../guides/media/ticker.md)

## Region attributes

These apply to `<region>`/`<root-layout>` elements defined inside the SMIL `<layout>`.

### regionName / `xml:id`

**Type:** string · **Default:** none · **Applies to:** `<region>`

Name the media elements reference in their `region` attribute. `xml:id` works as an alias.

```xml
<region xml:id="main" left="0" top="0" width="1080" height="1920" />
<!-- media reference it the same way as regionName -->
<img src="ad.jpg" dur="5s" region="main" />
```

Used in: [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)

### left / top / width / height

**Type:** number (px) or percentage · **Default:** none · **Applies to:** `<region>`

Position of the region (`left`, `top`) and size of the region (`width`, `height`). Absolute pixels or percentages.
Percentage positions and sizes are resolved against the display resolution (for nested trigger sub-regions, against
the parent region).

Used in: [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)

### bottom / right

**Type:** number (px) or percentage · **Default:** none · **Applies to:** `<region>`

Alternative anchoring — e.g. `bottom="0"` pins the region to the bottom edge. Resolved against the **display
viewport**, not the `root-layout` values.

```xml
<!-- bar pinned to the bottom-right corner of the viewport -->
<region regionName="bottom-bar" right="0" bottom="0" width="1080" height="360" />
```

Used in: [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)

### sync

**Type:** boolean · **Default:** `false` · **Applies to:** `<region>`

`sync="true"` marks the region for multi-device synchronization.

Used in: [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md), [Playback Synchronization](../guides/synchronization/playback-synchronization.md)

### backgroundColor / mediaAlign (inert)

**Type:** n/a (accepted, ignored) · **Default:** n/a · **Applies to:** `<region>`

`backgroundColor` and `mediaAlign` attributes are accepted in the XML but have no visual effect on regions — the
player renders regions with a transparent background.

Used in: [Screen Layout and Regions](../guides/layout-playlist/layout-regions.md)
