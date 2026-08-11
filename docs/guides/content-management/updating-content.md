---
sidebar_position: 1
---

# Updating Content

signageOS SMIL Player runs in **PULL mode**: the player, not the server, drives updates. It periodically re-fetches
the SMIL playlist and re-checks the media it references, rather than waiting for the server to push a change.

## How updates are detected

To supply fresh content to a player, specify the `Refresh` meta attribute in the `<head>` of the first SMIL playlist
loaded from the server:

```xml

<smil>
    <head>
        <!-- How often to refresh the SMIL, values in SECONDS -->
        <meta http-equiv="Refresh" content="60" onlySmilUpdate="true"/>
    </head>
    <!-- Additional elements here -->

</smil>
```

The player reaches the SMIL playlist URL and checks the `Last-Modified` header. Any change to the `Last-Modified`
value triggers a re-download — this includes both newer versions and rollbacks to older versions. If the server does
not provide a `Last-Modified` header, the player treats the file as unchanged and continues using the cached version.
The same `Last-Modified` comparison drives update checks for individual media files.

> The SMIL player makes a `HEAD` request to check `Last-Modified` instead of using GET/POST — this saves bandwidth.
> If you encounter CORS issues, ensure that your CDN/storage supports CORS for `HEAD` requests as well.

An alternative detection strategy is available for CDNs that serve content through redirect URLs: set
`updateMechanism="location"` on the `<meta>` tag to compare the `Location` header (the redirect target) instead of
`Last-Modified` — see the [`updateMechanism` reference entry](../../reference/meta-attributes.md#updatemechanism)
for how query strings factor into the comparison.

```xml
<head>
    <meta http-equiv="Refresh" content="60" updateMechanism="location"/>
</head>
```

Full attribute semantics (defaults, accepted values) live in the
[`<meta>` Attribute Reference](../../reference/meta-attributes.md#content) —
see `content`, `updateMechanism`, and `fallbackToPreviousPlaylist`.

An alternative to interval polling altogether is [Check Before Play](check-before-play.md), which checks each media
file immediately before it plays instead of on a timer.

## SMIL file vs media intervals

The SMIL file itself and the media it references can be checked on separate schedules. By default both share the
`content` interval; set `contentRefresh` and/or `smilFileRefresh` to split them — useful because SMIL files typically
change far less often than the media inside them:

```xml
<smil>
    <head>
        <meta http-equiv="Refresh"
              content="60"
              contentRefresh="120"
              smilFileRefresh="30"
              fallbackToPreviousPlaylist="true"/>
    </head>
    <!-- Additional elements here -->
</smil>
```

All `Refresh` attributes (`content`, `contentRefresh`, `smilFileRefresh`,
[`timeOut`](../../reference/meta-attributes.md#timeout), `fallbackToPreviousPlaylist`)
must sit on a single `<meta http-equiv="Refresh">` element — see the
[`<meta>` Attribute Reference](../../reference/meta-attributes.md) for why a second Refresh meta resets them.

If you only care about playlist-structure changes and want to stop polling every media file individually, set
`onlySmilUpdate="true"` — only the SMIL file is checked, on the interval above.

`fallbackToPreviousPlaylist="true"` is a safety net for broken uploads: if a newly downloaded SMIL file fails to
download or parse, the player keeps playing the last valid playlist and keeps retrying the broken URL in the
background. See [Backup Image](backup-image.md) for the related black-screen fallback that covers the *first* SMIL
load.

## Per-element overrides

Individual `<video>`, `<img>`, and `<ref>` elements can override the playlist-wide update strategy:

```xml
<img dur="5s"
     src="https://cdn.example.com/content/banner.jpg"
     updateCheckUrl="https://api.example.com/check/banner"
     updateCheckInterval="30"
     allowLocalFallback="true"
     region="main" fit="fill"/>
```

**`updateCheckUrl`** points the update check at a different URL than `src` — useful when content is served from a
CDN but update checks should go to the origin server, or when a lightweight endpoint reports update status without
serving the whole file.

**`updateCheckInterval`** sets a per-element refresh interval, letting critical content (live data) be checked more
often, or stable content less often, than the playlist default. It only applies to interval-based polling — under
[Check Before Play](check-before-play.md) media is checked right before playback instead, and this attribute has no
effect.

**`allowLocalFallback`** decides what happens when the update check itself fails — set it to `false` for
time-sensitive content that shouldn't display a stale cached version during an outage, or leave it unset to keep the
cached version playing while the server is unreachable.

See the [Element Attribute Reference](../../reference/element-attributes.md#updatecheckurl) for exact defaults and
failure-mode boundaries (network error vs. 5xx vs. timeout).

## Reacting to HTTP status codes

Two `<meta>` attributes let the update check itself signal content availability using ordinary HTTP status codes,
independently of `Last-Modified`:

```xml
<head>
    <meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="404"/>
</head>
```

`skipContentOnHttpStatus` skips an element (no black screen, playlist continues) when its update check returns a
listed 4xx status, and un-skips it automatically the moment the URL serves content again.

```xml
<head>
    <meta http-equiv="Refresh" content="60" updateContentOnHttpStatus="226"/>
</head>
```

`updateContentOnHttpStatus` forces a re-download when the update check returns a listed status, regardless of
`Last-Modified` — handy for origins that signal "this changed" via a dedicated status code rather than headers.
Never list a code your server returns on routine checks — see the
[`updateContentOnHttpStatus` reference entry](../../reference/meta-attributes.md#updatecontentonhttpstatus) for why.

5xx codes are handled before either list is consulted; see the
[`skipContentOnHttpStatus` reference entry](../../reference/meta-attributes.md#skipcontentonhttpstatus) for the
full status-code contract.

A gate for deciding *whether an already-cached element plays this pass* — as opposed to whether it gets
re-downloaded — is a separate mechanism; see [Playability Gate](playability-gate.md).

## Full example

```xml
<smil>
    <head>
        <meta http-equiv="Refresh" content="60"
              updateMechanism="location"
              skipContentOnHttpStatus="404"
              updateContentOnHttpStatus="226"/>

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

To also gate *playback* of any of these elements on a live entitlement/availability check, add `playCheckUrl` — see
[Playability Gate](playability-gate.md).

## See also

- [Check Before Play](check-before-play.md) — check each media file for updates right before playback instead of polling
- [Playability Gate](playability-gate.md) — per-pass play/skip decisions independent of update checks

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
