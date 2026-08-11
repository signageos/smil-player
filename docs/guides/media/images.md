---
sidebar_position: 2
---

# Image

## Basic usage of still Image

A simple image played for defined duration.

```xml
<img src="ad2.jpg" dur="5s" fit="fill"/>
```

### Using Query Parameters

Images can include query parameters for dynamic content, versioning, or tracking purposes. Each unique URL with
different query parameters will be cached as a separate file.

```xml
<!-- Different banner versions cached separately -->
<img src="https://example.com/banner.jpg?version=1.0&amp;lang=en" dur="5s" region="main"/>
<img src="https://example.com/banner.jpg?version=1.0&amp;lang=es" dur="5s" region="main"/>

<!-- Dynamic image selection based on parameters -->
<img src="https://cdn.example.com/promo.jpg?campaign=holiday&amp;week=1" dur="10s" fit="cover"/>
```

**Note:** Remember to use `&amp;` instead of `&` for proper XML encoding when separating query parameters.

`dur` controls how long the image stays on screen (default 5 seconds, `indefinite` keeps it on screen), and `fit`
controls how it's positioned within its region (default `fill`) — see [`dur`](../../reference/element-attributes.md#dur)
and [`fit`](../../reference/element-attributes.md#fit) for the full value lists and defaults. Overlapping images can
be stacked with [`z-index`](../../reference/element-attributes.md#z-index) — this also works for widgets and
tickers, but not videos.

## Images transitions

Smil player offers an option to create a crossFade or billboard transition between two images or image and widget. If
there is a video after image in the playlist, the transition will not be displayed. Transition image -> widget works
only for crossFade transition. Billboard transition supports only image -> image use case.

[Crossfade transition](../layout-playlist/transitions.md#crossfade)\
[Billboard transition](../layout-playlist/transitions.md#billboard)
