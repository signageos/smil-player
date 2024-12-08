# Image

signageOS SMIL Player supports multimedia objects, including videos, images, streams, video inputs, HTML5 widgets and
HTML5 websites.

## Basic usage of still Image

A simple image played for defined duration.

```xml

<img src="ad2.jpg" dur="5s" fit="fill"/>
```

The `dur` attribute specifies a duration of the still image during playback. The valid value is either with or without
`s`econds - `dur="10"` `dur="10s"`. Decimals are *not allowed* (e.g. dur="10.45s").

The `fit` attribute defines how to position image within the region. Options are:The `dur` attribute specifies a
duration of the still image during playback. The valid value is either with or without `s`econds - `dur="10"`
`dur="10s"`. Decimals are *not allowed* (e.g. dur="10.45s").

| Fill option | Description                                                                                                                                                                     |
|:------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `fill`      | Default option <br />Shrink or stretch the content to completely fill the area (without preserving aspect ratio)                                                                |
| `meet`      | Scale the content while preserving aspect ratio until one of the dimensions meets the that of the area <br />Similar to css property `object-fit: contain`                      |
| `meetBest`  | Not implemented, behaves the same as `meet`                                                                                                                                     |
| `cover`     | Image is sized to maintain its aspect ratio while filling the element's entire content box. The object will be clipped to fit <br />Similar to css property `object-fit: cover` |
| `z-index`   | In case you need to overlap images, you can assing z-index to it. <br />Similar to html property `z-index="5"`                                                                  |

## Images transitions

Smil player offers an option to create a crossFade or billboard transition between two images or image and widget. If
there is a video after image in the playlist, the transition will not be displayed. Transition image -> widget works
only for crossFade transition. Billboard transition supports only image -> image use case.

[Crossfade transition](../transitions/crossfade-transition.md)\
[Billboard transition](../transitions/billboard-transition.md)
