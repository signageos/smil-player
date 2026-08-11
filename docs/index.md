---
sidebar_position: 1
---

# Introduction to signageOS SMIL Player

signageOS has implemented a well-known standard for playlist definition - SMIL, based on
the ["a-smil"](http://www.a-smil.org/) version. This universal SMIL player allows anyone to define a standardized
playlist and then submit the URL where the playlist definition is located.

The signageOS SMIL player will get the playlist, store it internally, cache all files and widgets, and begin with the
playback.

## Main benefits

1. Using **standardized playlist** and player removes the burden of "re-inventing the wheel" for common use cases
1. SMIL playlist supports **all possible features and scenarios** you might need - zones, regions, scheduling, layouts,
   priority playback, triggered playback, sensors, web widgets, and conditional playback, etc.
1. SMIL Player is **open-sourced (MIT)**, you can freely adjust it if you need additional features
1. SMIL Player is optimized to **run smoothly on
   all [supported devices](https://signageos.zendesk.com/hc/en-us/sections/4405700629266-Supported-Devices)**

:::tip
From our experience, building a similar Player requires 8-12 months to reach the point where it has all the features and
the Player is robust enough to be deployed in a large scale (tens of thousands of devices).

By using the already existing SMIL Player, you save this time and resources which you can allocate to the features of
your CMS system.
:::

## How the SMIL playlist looks like

```xml title="Sample SMIL playlist definition"
<smil>

    <head>
        <layout>
            <root-layout width="1080" height="1920" backgroundColor="#FFFFFF" /> <!-- define regions/zones -->
            <region regionName="main" left="0" top="0" width="1080" height="1920" z-index="1"
                backgroundColor="#FFFFFF" />
        </layout>
    </head>

    <body>
        <par>
            <!-- define what should be played in regions -->
            <seq repeatCount="indefinite"> <video
                    src="https://demo.signageos.io/smil/samples/assets/landscape1.mp4"
                    region="main"></video> <img dur="5s"
                    src="https://demo.signageos.io/smil/samples/assets/landscape2.jpg"
                    region="main"></img> </seq>
        </par>
    </body>
</smil>
```

## Documentation map

- **[Getting Started](getting-started/build-and-deploy.md)** — build the applet, deploy it to a device, and play your first SMIL playlist.
- **[Layout & Playlists](guides/layout-playlist/layout-regions.md)** — regions, `seq`/`par`/`excl` playlist structure, random order, priority playback, transitions.
- **[Media Types](guides/media/videos.md)** — videos, images, widgets, websites, streams/inputs, and tickers.
- **[Scheduling](guides/scheduling/wallclock-scheduling.md)** — wallclock time windows and conditional playback expressions.
- **[Triggers](guides/triggers/overview.md)** — keyboard, mouse/touch, widget, and sensor-driven interactivity.
- **[Synchronization](guides/synchronization/playback-synchronization.md)** — multi-device sync, dynamic synchronization, and trigger failover.
- **[Content Management](guides/content-management/updating-content.md)** — update detection, check-before-play, the playability gate, caching, and backup image.
- **[Reporting](guides/reporting/setup.md)** — setting up proof-of-play and event reporting.
- **[`<meta>` Attribute Reference](reference/meta-attributes.md)** — every `<meta>` tag attribute.
- **[Element Attribute Reference](reference/element-attributes.md)** — attributes accepted on playlist elements (`video`, `img`, `ref`, etc.).
- **[Applet Configuration Reference](reference/applet-config.md)** — every Timing Configuration option.
- **[Reporting Events & Payloads](reference/reporting-payloads.md)** — event types and JSON payload shapes.
- **[Supported SMIL Features](reference/supported-features.md)** — compliance matrix against the a-smil standard.
