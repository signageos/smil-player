---
sidebar_position: 3
---

# Triggers using mouse or touch display

From v1.6.1, you can use onClick/onTouch events as a trigger for activating content playback in a SMIL Playlist.

## Using onClick/onTouch to trigger content

- The `origin` is always set as `mouse`
- `data`: no data specified in this case. A SMIL file can have only **one** onClick/onTouch trigger per playlist — a
  `data` value on a mouse condition would never match.
- `action` is set to `click` (informational; both mouse clicks and touch events activate the trigger)

The trigger fires on a click or touch **anywhere on the screen** — there is no way to restrict it to a region.

```xml

<trigger id="trigger1" condition="or">
    <condition
            origin="mouse"
            action="click"
    />
</trigger>
```

For sub-region setup see [Sub-regions](overview.md#sub-regions), for trigger duration (`dur`/`repeatCount`) see
[Trigger duration](overview.md#trigger-duration), and for cancellation (`end`) see
[Cross-trigger cancellation](overview.md#cross-trigger-cancellation). Clicks inside a widget shown by the trigger
also count toward re-firing it (extending its duration).

### Define content triggered by the trigger

```xml

<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>      -->
    <seq begin="trigger1">
        <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```
