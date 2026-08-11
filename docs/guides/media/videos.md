---
sidebar_position: 1
---

# Video

## Basic usage

A simple video played for its entire duration.

```xml
<video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"/>
```

To ensure your video will be played, check
the [supported video files formats and codecs](https://docs.signageos.io/hc/en-us/articles/4405387474322) by your
devices.

### Using Query Parameters

You can include query parameters in video URLs for dynamic content selection, tracking, or versioning. Each unique
URL with different query parameters will be cached separately.

```xml
<!-- Videos with different query parameters are cached separately -->
<video src="https://example.com/video?campaign=summer&amp;id=1" region="main"/>
<video src="https://example.com/video?campaign=summer&amp;id=2" region="main"/>

<!-- Using query parameters for analytics tracking -->
<video src="https://demo.signageos.io/video.mp4?source=playlist&amp;device=display1"
       popName="video_event" popType="video" popTags="tracking"/>
```

**Note:** Remember to use `&amp;` instead of `&` for proper XML encoding when separating query parameters.

The `popName`/`popType`/`popTags` attributes above tag the video for proof-of-play reporting — see
[Proof of Play](../reporting/proof-of-play.md) and the
[`popName`](../../reference/element-attributes.md#popname) /
[`popType`](../../reference/element-attributes.md#poptype) /
[`popTags`](../../reference/element-attributes.md#poptags) reference entries.

## Video duration

Use the `dur` attribute to limit playback length — see [`dur`](../../reference/element-attributes.md#dur) for exact
semantics (cutting behavior, clock-value caveats).

```xml
<video src="https://demo.signageos.io/smil/zones/files/video_1.mp4" dur="15s"/>
```

## Playing video in the background

Use `videoBackground` in the applet configuration when you need images or widgets to appear on top of a video — see
[`videoBackground`](../../reference/applet-config.md#videobackground) for exact behavior.
