---
sidebar_position: 1
---

# Screen Layout and Regions

The layout of the screen is defined in the global header section of SMIL document.

## Layout

Within the `<head>` node, one can use the `<layout>` tag to define screen regions/zones.

```xml
<smil>
  <head>
    <layout>
      <!-- Global layout definition here -->
    </layout>
  </head>
  <body>
    <!-- Contents here -->
  </body>
</smil>
```

## Global resolution

The `<root-layout>` tag defines the width and height of the display area. For digital signage, this is the logical resolution of the entire screen area.

```xml
<layout>
  <root-layout width="1920" height="1080" />
</layout>
```

## Region

The `<region>` tag defines an area over the entire display zone where individual media items can be assigned to play. Media objects can then be assigned to any of the defined region. If media has no region assigned, smil player will assign root-layout region to media definition.

```xml title="Example of 4 zones layout"
<layout>
  <root-layout width="1280" height="720" />
  <region regionName="video" top="0" left="0" width="720" height="480" z-index="1" />
  <region regionName="ticker" top="480" left="0" width="1280" height="240" z-index="1" />
  <region regionName="slideshow" top="0" left="720" width="560" height="480" z-index="1" />
  <region regionName="overlay" top="50" left="50" width="100" height="100" z-index="2" />
</layout>
```

In the example above the `<head>` section defines a typical 3-zone digital signage application with a zone for 720x480 video, a slide show zone, and a ticker zone. Overlaying the video zone is an overlay layer which allows the user to place a logo or a dynamic message on-top of the running video.

> Overlay over video is not yet supported. Feature in development.