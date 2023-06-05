# Image

signageOS SMIL Player supports multimedia objects, including videos, images, streams, video inputs, HTML5 widgets and HTML5 websites.

## Basic usage of still Image
A simple image played for defined duration.

```xml
<img src="ad2.jpg" dur="5s" fit="fill" />
```

The `dur` attribute specifies a duration of the still image during playback. The valid value is either with or without `s`econds - `dur="10"` `dur="10s"`. Decimals are *not allowed* (e.g. dur="10.45s").

The `fit` attribute defines how to position image within the region. Options are:

|Fill option|Description|
| :- | :- |
|`fill`|Default option <br />Shrink or stretch the content to completely fill the area (without preserving aspect ratio)|
|`meet`|Scale the content while preserving aspect ratio until one of the dimensions meets the that of the area <br />Similar to css property `object-fit: contain`|
|`meetBest`|Not implemented, behaves the same as `meet`|
|`cover`|Image is sized to maintain its aspect ratio while filling the element's entire content box. The object will be clipped to fit <br />Similar to css property `object-fit: cover`|
|`z-index`|In case you need to overlap images, you can assing z-index to it. <br />Similar to html property `z-index="5"`|

## Images transitions

Smil player offers an option to create a crossfade transition between two images. Currently, only crossfade transition is supported and it is supported only between two images. If there is a widget or video after image in the playlist, the transition will not be displayed.

### Definition

Transition definition is placed inside `<layout>` tag in SMIL file `<head>`.

- The `xml:id` or `transitionName` is the ID of the transition used later in the playlist
- `type` defines the behavior of the transition. Only `fade` is currently supported
- `subtype` visualization of the transition. Only `crossfade` is currently supported
- `dur` duration of the transition ( How long it will take to transition from one image to another). Specified in seconds, *supports* decimal values ( 0.6s )

```xml
<layout>
    <!-- Transition definition -->
    <transition transitionName="bwt" type="fade" subtype="crossfade" dur="1s" />

    <!-- Standard layout definition -->
    <root-layout backgroundColor="#000000" height="1080" width="1920" />
    <region regionName="video" left="10" top="10" width="1280" height="720"> </region>
</layout><!-- later when you want to use the transition on the image element --><img src="image.jpg" region="main" dur="6s" transIn="bwt">
```
