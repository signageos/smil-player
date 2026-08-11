---
sidebar_position: 6
---

# Ticker

The `<ticker>` element allows the display of scrolling text (ticker) on the screen. It is configurable in terms of
appearance, speed, and content.

## Basic usage

```xml
<ticker
        region="image"
        dur="10s"
        fontName="Arial"
        fontSize="30"
        fontColor="#ffd800"
        linearGradient="#ff0000 0%, #aa9999 100%"
        indentation="50"
        velocity="50">
    <text>Text1.</text>
    <text>Text2.</text>
</ticker>
```

- Displays a ticker in the `image` region for 10 seconds.
- Uses the Arial font at a size of 30px in yellow (`#ffd800`).
- Adds a red-to-gray gradient effect.
- Scrolls text starting 50 pixels from the edge at a speed of 50 pixels/second.
- Displays "Text1." and "Text2." sequentially.

See the [Element Attribute Reference](../../reference/element-attributes.md#ticker-attributes) for the full
`fontName` / `fontSize` / `fontColor` / `linearGradient` / `linearGradientAngle` /
`backgroundColor` / `indentation` / `velocity` list and their defaults, the common
[`region`](../../reference/element-attributes.md#region) and [`dur`](../../reference/element-attributes.md#dur)
attributes, and
[`z-index`](../../reference/element-attributes.md#z-index) for stacking order against other content.

Tickers also support the per-element update and proof-of-play attributes shared by all media types (see
[Updating Content](../content-management/updating-content.md) and
[Proof of Play](../reporting/proof-of-play.md)).

### Text Element

Represents individual messages in the ticker.
The `<ticker>` element can contain multiple `<text>` elements, which will scroll sequentially.
Each `<text>` element contains a string that will be displayed as part of the ticker.

```xml
<text>This is testing content for new Ticker component.</text>
<text>This is another testing content for new Ticker component.</text>
```

The ticker will play the first message, then the second message, the first message and so on.
