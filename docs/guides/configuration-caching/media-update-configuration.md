# Media Update Configuration

## Overview

By default the SMIL player checks for media updates using the `Last-Modified` HTTP header on a shared polling
interval. Per-element update attributes let you override this behaviour for individual media files — use a different
update strategy, point update checks at a separate URL, set a custom check interval, or control what happens when the
server is unreachable.

## Update mechanism

The `updateMechanism` attribute is set on the `<meta>` tag and applies to all media in the playlist.

| Value | Behaviour |
|-------|-----------|
| `last-modified` (default) | The player sends a HEAD request and compares the `Last-Modified` header to decide whether to re-download. |
| `location` | The player sends a HEAD request and compares the `Location` header (redirect URL). If the redirect target changes, the file is considered updated. Useful when your CDN serves content through redirect URLs that change on each new version. |

```xml
<head>
    <meta http-equiv="Refresh" content="60" updateMechanism="location"/>
</head>
```

## Per-element attributes

These attributes can be placed directly on any media element (`<video>`, `<img>`, `<ref>`).

### updateCheckUrl

Custom URL used for the HEAD update-check request instead of the element's `src`. This is useful when you have a
lightweight endpoint that returns update information without serving the full file.

```xml
<video src="https://cdn.example.com/video.mp4"
       updateCheckUrl="https://api.example.com/check/video.mp4"
       dur="30s" region="main"/>
```

### updateCheckInterval

Per-element refresh interval in seconds. Overrides the global refresh interval defined in the `<meta>` tag for this
specific element.

```xml
<img src="https://cdn.example.com/banner.jpg"
     updateCheckInterval="120"
     dur="10s" region="main"/>
```

### allowLocalFallback

When set to `true`, the player keeps playing the cached version of the file if the update-check request fails (server
unreachable, timeout, etc.). When set to `false`, the element is skipped entirely if the server cannot be reached.

Defaults to `true`.

```xml
<video src="https://cdn.example.com/ad.mp4"
       allowLocalFallback="false"
       dur="15s" region="main"/>
```

### skipContentOnHttpStatus

Comma-separated list of HTTP status codes. If the update-check HEAD request returns one of these status codes, the
element is skipped and will not be played.

This attribute is set on the `<meta>` tag and applies globally.

```xml
<head>
    <meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="404,503"/>
</head>
```

### updateContentOnHttpStatus

Comma-separated list of HTTP status codes. If the update-check HEAD request returns one of these status codes, the
player forces a re-download of the file regardless of whether headers indicate a change.

This attribute is set on the `<meta>` tag and applies globally.

```xml
<head>
    <meta http-equiv="Refresh" content="60" updateContentOnHttpStatus="200"/>
</head>
```

### useInReportUrl

When set on a media element, the player reports this URL in event/PoP reports instead of the element's `src`. This is
useful when your content goes through redirects and you want reports to contain the actual final URL.

```xml
<video src="https://cdn.example.com/redirect/video"
       useInReportUrl="https://cdn.example.com/actual/video.mp4"
       dur="30s" region="main"/>
```

## Full SMIL example

```xml
<smil>
    <head>
        <meta http-equiv="Refresh" content="60"
              updateMechanism="location"
              skipContentOnHttpStatus="404,503"
              updateContentOnHttpStatus="200"/>

        <layout>
            <root-layout width="1920" height="1080"/>
            <region regionName="main" left="0" top="0" width="1920" height="1080" z-index="1"/>
        </layout>
    </head>
    <body>
        <par>
            <seq repeatCount="indefinite">
                <!-- Check a separate URL for updates, skip if server is down -->
                <video src="https://cdn.example.com/promo.mp4"
                       updateCheckUrl="https://api.example.com/check/promo"
                       allowLocalFallback="false"
                       dur="30s" region="main"/>

                <!-- Use default update checks, fall back to cache if offline -->
                <img src="https://cdn.example.com/banner.jpg"
                     allowLocalFallback="true"
                     dur="10s" region="main"/>

                <!-- Custom check interval for this element only -->
                <video src="https://cdn.example.com/news.mp4"
                       updateCheckInterval="300"
                       dur="60s" region="main"/>
            </seq>
        </par>
    </body>
</smil>
```

## See also

- [Updating SMIL Playlist](updating-smil-playlist.md) — global refresh intervals and playlist-level update settings
- [Check Before Play](check-before-play.md) — check each media file for updates right before playback

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
