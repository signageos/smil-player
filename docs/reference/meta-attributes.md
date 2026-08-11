---
sidebar_position: 1
---

# `<meta>` Attribute Reference

`<meta>` tags in the SMIL `<head>` configure playlist-wide behavior — how often the player checks for updates, how
it reacts to HTTP status codes, default playback and transition settings, and event reporting. Most of these
attributes live together on a single `<meta http-equiv="Refresh">` element; a handful of unrelated attributes are
set on their own standalone `<meta>` tags instead.

> ### Important: use a single `<meta>` element
> All Refresh attributes (`content`, `contentRefresh`, `smilFileRefresh`, `timeOut`, `fallbackToPreviousPlaylist`)
> must be placed on **one** `<meta http-equiv="Refresh">` element, as in the examples on this page. `timeOut` and
> `fallbackToPreviousPlaylist` are only read together with `content`/`contentRefresh`, and a second Refresh meta
> element resets them to their defaults.

## `<meta http-equiv="Refresh">`

### content

**Type:** number (seconds) · **Default:** `20` · **Applies to:** `<meta http-equiv="Refresh">`

Defines the check interval in seconds for both SMIL file and media content. Optional — when the whole `Refresh`
meta is missing, a default of `20` seconds is used. Values of `0` or below are not supported (there is no
"disable updates" value; use `onlySmilUpdate` or long intervals instead).

Used in: [Updating Content](../guides/content-management/updating-content.md)

### contentRefresh

**Type:** number (seconds) · **Default:** none (falls back to `content`) · **Applies to:** `<meta http-equiv="Refresh">`

Separate refresh interval in seconds for media content only. When set, media files are checked at this interval
instead of the `content` value.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### smilFileRefresh

**Type:** number (seconds) · **Default:** none (falls back to `content`) · **Applies to:** `<meta http-equiv="Refresh">`

Separate refresh interval in seconds for the SMIL file itself. When set, the SMIL file is checked at this interval
instead of the `content` value. Must be a plain number of seconds.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### onlySmilUpdate

**Type:** boolean · **Default:** `false` · **Applies to:** `<meta http-equiv="Refresh">`

When set to true, the player only checks the actual SMIL file for updates and not the media specified within the
SMIL file.

If you want to turn off head requests which monitor if some media files was updated, you can specify in your smil
file `onlySmilUpdate` attribute in refresh `<meta>` tag in smil header.

```xml
<meta http-equiv="Refresh" content="10" onlySmilUpdate="true"/>
```

This xml above means, that SMIL player will check for updates only original smil file and not all media which are
specified within the smil file. Smil player will check for smil file changes each 10 seconds.

If `onlySmilUpdate` is missing, the default value is false, which means the SMIL player will check all media
files for updates.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### fallbackToPreviousPlaylist

**Type:** boolean · **Default:** `false` · **Applies to:** `<meta http-equiv="Refresh">`

When set to `true`, the player continues playing the previous valid playlist if a newly downloaded SMIL file is
invalid (fails to download or parse). Prevents a broken upload from taking down playback. While in fallback mode,
the player re-checks the broken SMIL URL every 60 seconds and switches back once a valid file appears. Note: a
syntactically valid SMIL file with an *empty* playlist is treated as a valid state (nothing plays) — it does not
trigger the fallback.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### timeOut

**Type:** number (milliseconds) · **Default:** `2000` · **Applies to:** `<meta http-equiv="Refresh">`

You can configure the timeout for HEAD requests that check for file updates using the `timeOut` attribute:

```xml
<meta http-equiv="Refresh" content="60" timeOut="5000" onlySmilUpdate="false"/>
```

- `timeOut` - Timeout in milliseconds for HEAD requests (default: 2000ms)
- This timeout applies to all update checks (SMIL file and media files)
- For slower or unstable networks, consider increasing the timeout to 5000-10000ms
- The timeout prevents the player from waiting too long when checking for updates on slow connections

**Timeout is shared with the update checks** — the playCheckUrl gate GET also uses the `<meta timeOut>` value; see
[Playability Gate](../guides/content-management/playability-gate.md)
for how a hanging gate endpoint affects gated plays.

Used in: [Updating Content](../guides/content-management/updating-content.md), [Playability Gate](../guides/content-management/playability-gate.md)

### updateMechanism

**Type:** enum (`last-modified` \| `location`) · **Default:** `last-modified` · **Applies to:** `<meta http-equiv="Refresh">`

The `updateMechanism` attribute is set on the `<meta>` tag and applies to all media in the playlist.

| Value | Behaviour |
|-------|-----------|
| `last-modified` (default) | The player sends a HEAD request and compares the `Last-Modified` header to decide whether to re-download. |
| `location` | The player sends a HEAD request and compares the `Location` header (redirect URL). If the redirect target changes to a different URL path, the file is considered updated. A change in **query parameters only** (e.g. a rotating signed-URL token) is *not* treated as a new version — the comparison ignores the query string, so signed CDN URLs don't trigger pointless re-downloads. Useful when your CDN serves content through redirect URLs that change on each new version. |

Used in: [Updating Content](../guides/content-management/updating-content.md)

### checkBeforePlay

**Type:** boolean · **Default:** `false` · **Applies to:** `<meta http-equiv="Refresh">`

Right before a media element (video, image, widget) is played, the player makes a HEAD request to check if the
source file has changed. If an update is detected, the new file is downloaded and committed before playback
begins. Interval-based media checking is automatically disabled (`onlySmilUpdate` is forced to `true`
internally) — only the SMIL file itself is still polled on the refresh interval.

`checkBeforePlay` replaces the interval-based media update mechanism; it does not add a second check on top of
it. Media files are only checked right before they are played, not on a timer.

Used in: [Check Before Play](../guides/content-management/check-before-play.md)

### checkAheadCount

**Type:** number · **Default:** `0` (lookahead disabled) · **Applies to:** `<meta http-equiv="Refresh">`

Without a lookahead, the HEAD check for element _N_ happens right before element _N_ plays — which can visibly
delay the transition while the HEAD (and any triggered download) completes. Set `checkAheadCount` to have the
player check the element _N_ positions ahead while the current element is still playing:

```xml
<meta http-equiv="Refresh" content="60" checkBeforePlay="true" checkAheadCount="2"/>
```

With `checkAheadCount="2"`, while element _K_ is playing the player issues a HEAD for element _K+2_. The
lookahead **wraps around** modulo the number of media entries in the current playlist container, so an indefinite
`<seq>` checks every slot, including the last few items (they are checked when the start of the playlist plays).
A slot that previously returned a `skipContentOnHttpStatus` code (e.g. a 404) is **still re-checked** by the
lookahead on later cycles — that periodic HEAD is what lets the element recover automatically once its URL serves
content again. When the _K+N_ slot is currently skipped, the lookahead additionally checks the next playable
slot, so a healthy target fires exactly one HEAD per transition and a recovering one at most two. Non-positive or
invalid `checkAheadCount` values disable the lookahead.

Updates are discovered via this lookahead; the subsequent background download and commit may land later — up to
the next full iteration of the playlist. Worst-case detection latency is roughly `checkAheadCount ×
average_element_duration`. Lower `checkAheadCount` keeps the HEAD closer to the moment the change becomes
visible; higher values give slow networks more lead time to finish the download before the element plays.

Used in: [Check Before Play](../guides/content-management/check-before-play.md)

### skipContentOnHttpStatus

**Type:** comma-separated list of HTTP status codes (4xx only) · **Default:** none (empty) · **Applies to:** `<meta http-equiv="Refresh">`

Comma-separated list of HTTP status codes. If the update-check HEAD request returns one of these status codes,
the element is skipped and will not be played. The element recovers automatically once its URL serves content
again.

Only 4xx codes work here — **5xx server errors are handled before this list is consulted** (cached copy plays, or
the element is skipped when it sets `allowLocalFallback="false"`), so listing 500/503 has no effect.

```xml
<head>
    <meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="404"/>
</head>
```

Used in: [Updating Content](../guides/content-management/updating-content.md)

### updateContentOnHttpStatus

**Type:** comma-separated list of HTTP status codes · **Default:** none (empty) · **Applies to:** `<meta http-equiv="Refresh">`

Comma-separated list of HTTP status codes. If the update-check HEAD request returns one of these status codes, the
player forces a re-download of the file regardless of whether headers indicate a change.

**Never list `200` (or any code your server returns on every ordinary check) here.** A healthy origin answers
`200` to every update check, so listing it forces a full re-download of every media file on every refresh
interval, forever — burning bandwidth and device storage. Use a distinctive out-of-band code (such as `226 IM
Used`) that your server returns only when it wants to force a refresh. Another example is `205 - Reset Content`
(an explicit refresh request). As with the skip list, 5xx codes have no effect here.

Used in: [Updating Content](../guides/content-management/updating-content.md)

### skipPlaybackOnHttpStatus

**Type:** comma-separated list of HTTP status codes · **Default:** none (unset ⇒ gate inert) · **Applies to:** `<meta http-equiv="Refresh">`

**`<meta skipPlaybackOnHttpStatus>` is required** — without it (or with an empty value) the gate is inert: the
element always plays, no gate request is sent, and the player logs a one-time debug warning. Non-numeric entries
in the list are ignored; if no valid status code remains (e.g. `"404;500"` — wrong separator), the gate is inert
as above. The list is read **only** by the gate and is fully independent of `skipContentOnHttpStatus`: a gate
status never marks content `skipContent`, and the update-check channel never consults the gate list. This keeps,
for example, a CDN 403 on `src` (expired signed URL) from being confused with a deliberate "not entitled" gate
answer.

**Redirects resolve transparently** — the *final* status after redirects is classified; listing 3xx has no
effect.

**Recommended status contract:** `skipPlaybackOnHttpStatus="403,404,410"` (minimally `"404"`). Serve **200** (or
204) to play; **404** = no content for this slot, **410** = campaign ended, **403** = device not entitled. These
are origin-generated 4xx codes that intermediaries don't fabricate. Avoid listing **5xx** (an infrastructure
outage would masquerade as a gate decision and defeat fail-open for *every* gated element — use per-element
`playCheckSkipOnError="true"` instead), **3xx** (redirects resolve before classification), and **401** (auth
layers emit it on their own; use 403 for deliberate denial).

For the behavior of the gate itself (fail-open/skip modes, timing, CORS, sync-group interplay, priority
interplay), see [Playability Gate](../guides/content-management/playability-gate.md).

Used in: [Playability Gate](../guides/content-management/playability-gate.md)

## Standalone meta tags

### defaultRepeatCount

**Type:** enum (`1` \| `indefinite`) · **Default:** `1` (a `<seq>`/`<par>` without `repeatCount` plays once) · **Applies to:** `<meta defaultRepeatCount>`

When a `<seq>` or `<par>` has no `repeatCount`, it plays once. You can change this default globally with the
`defaultRepeatCount` meta attribute in the SMIL `<head>` — it applies to every `<seq>`/`<par>` that does not
specify its own `repeatCount`:

```xml
<meta defaultRepeatCount="indefinite"/>
```

Accepted values are `1` and `indefinite`.

Used in: [Sequence Playlist](../guides/layout-playlist/sequence-playlist.md)

### defaultTransition

**Type:** string (transition ID) · **Default:** none · **Applies to:** `<meta defaultTransition>`

SMIL player supports default transition for the whole playlist. It is defined in the `<head>` tag of the SMIL
file. The transition will be applied to all images and widgets in the playlist that do not have a different
transition defined directly (videos and tickers are not affected). If the referenced transition ID does not exist
in the `<layout>`, the default is silently ignored.

```xml
<meta defaultTransition="transitionID"/>
<layout>
<transition xml:id="transitionID" type="fade" subtype="crossfade" dur="1s"/>
<root-layout width="960" height="360"/>
<region regionName="video" left="0" top="0" width="960" height="360" z-index="1"
/>
</layout>
```

The value in the defaultTransition attribute is the ID of the transition defined in the layout tag. It has to
match.

Used in: [Transitions](../guides/layout-playlist/transitions.md)

### log / type / endpoint

**Type:** `log` boolean · `type` comma-separated list (`manual`, `standard`) · `endpoint` string (URL) · **Default:** `log` off · `type` `standard` when omitted · `endpoint` unset · **Applies to:** `<meta log>`

When a custom endpoint is specified, the SMIL player sends all reports to this endpoint, where you can process
them according to your needs. Reports are sent as POST requests with the body specified as an array of reports.

To enable logging, you must specify a `<meta>` tag with a log value in the SMIL header.

```xml
<meta log="true" type="manual" endpoint="customUrlEndpoint"/>
```

It's also possible to specify multiple logging types at the same time:

```xml
<meta log="true" type="manual,standard" endpoint="testingEndpoint"/>
```

`type="manual"` selects proof-of-play reporting, `type="standard"` selects the
[standard event reporting](./reporting-payloads.md#standard-events); listing both runs both. Unknown
types are ignored, and when `type` is omitted entirely, `standard` is used.

Alternatively, the endpoint can be set device-side with the `reportUrl` applet configuration option. When set, it
overrides the `endpoint` from the SMIL `<meta>`, force-enables reporting, and *adds* the proof-of-play type to
whatever types the SMIL configures. See [Applet Configuration Reference](./applet-config.md#reporturl).

> Note: `log="false"` disables the standard and native proof-of-play transports, but custom-endpoint POSTs are
> controlled by the presence of the `endpoint` (or `reportUrl` config) — remove the endpoint if you want them to
> stop.

Used in: [Setting Up Reporting](../guides/reporting/setup.md)

### reportFileLimit

**Type:** number · **Default:** `100` · **Applies to:** `<meta log>`

When using `reportMode="batch"`, the `reportFileLimit` attribute on the `<meta>` tag controls how many reports
are stored per batch file before a new file is created. The default is 100.

```xml
<meta log="true" type="manual" endpoint="https://example.com/reports" reportFileLimit="50"/>
```

The upload watcher runs every 10 minutes, but a file holding only batched reports is uploaded once it **reaches
the `reportFileLimit`** (or after a player restart) — not merely because 10 minutes passed. Files that also
contain failed-send reports are uploaded on the next watcher pass regardless of fill level.

Used in: [Setting Up Reporting](../guides/reporting/setup.md)
