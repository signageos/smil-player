---
sidebar_position: 6
---

# Transitions

## Setting up transitions

A `<transition>` element goes inside the `<layout>` tag in the SMIL `<head>`:

```xml
<layout>
    <transition xml:id="myTransition" type="fade" subtype="crossfade" dur="1s"/>
    <root-layout width="1920" height="1080"/>
    <region regionName="main" left="0" top="0" width="1920" height="1080" z-index="1"/>
</layout>
```

- `xml:id` (or `transitionName`) — the ID referenced by an image or widget's
  [`transIn`](../../reference/element-attributes.md#transin) attribute to use this transition.
- `type` — set to `fade` for a crossfade, `billboard` for a billboard transition.
- `subtype` — the visual style; only `crossfade` and `billboard` are supported, any other value results in no
  visual transition.
- `dur` — how long the transition takes, in seconds; decimal values are supported (e.g. `0.6s`).

The transition plays when the **next** element in the same region is an image or widget — when a video follows, the
transition is skipped (videos render on a different plane).

A playlist-wide default transition can also be set with
[`defaultTransition`](../../reference/meta-attributes.md#defaulttransition) instead of `transIn` on every element.

## Crossfade

Crossfade fades between two images, or between an image and a widget. Set `subtype="crossfade"`:

```xml
<layout>
    <transition transitionName="bwt" type="fade" subtype="crossfade" dur="1s"/>
    <root-layout height="1080" width="1920"/>
    <region regionName="main" left="10" top="10" width="1280" height="720"/>
</layout>
<img src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg" region="main"
     dur="6s" transIn="bwt"/>
```

## Billboard

Billboard animates image → image transitions only (widgets are not supported — use Crossfade for image ↔ widget)
as a grid of columns. Set `subtype="billboard"`:

- `columnCount` — number of columns animated. Default: `20`.
- `direction` — `left` or `right`. Default: `right`.

```xml
<layout>
    <transition xml:id="billboard" type="billboard" subtype="billboard" dur="1s" columnCount="50"
                direction="left"/>
    <root-layout width="960" height="360"/>
    <region regionName="main" left="0" top="0" width="960" height="360" z-index="1"/>
</layout>
<img src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg" region="main"
     dur="6s" transIn="billboard"/>
```
