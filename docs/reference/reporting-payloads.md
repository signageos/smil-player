---
sidebar_position: 4
---

# Reporting Events & Payloads

Reporting is turned on and its transport chosen via the `<meta log>` switchboard — see
[`log` / `type` / `endpoint`](./meta-attributes.md#log--type--endpoint) in the `<meta>` Attribute Reference. This
page documents the event types the player emits and the shape of each payload.

## Standard events

`type="standard"` (the default) selects the events documented in this section.

### Logged events

- each real file download successful or unsuccessful (`SMIL.FileDownloaded`) — internal copy/restore operations are
  not reported
- each media playback successful or unsuccessful (`SMIL.MediaPlayed`; media playing in a synchronized region reports
  as `SMIL.MediaPlayed-Synced`)
- each (re)start of SMIL playlist processing (`SMIL.PlaybackStarted`)
- some major errors (trigger initialization, sensors etc...) (`SMIL.Error`)

### Payload of messages

#### Download

When a download fails, `errorMessage` contains the HTTP status code of the failed request (e.g., `"HTTP 502"`). On
success, `errorMessage` is `null`. The `itemType` field identifies the media category: `image`, `video`, `ref`
(widget/website), `ticker`, or `smil` (the playlist file itself).

**Success**

```json
{
  "type": "SMIL.FileDownloaded",
  "itemType": "image",
  "source": {
    "filePath": {
      "path": "smil/images/img_5_37da4499.jpg",
      "storage": "internal"
    },
    "uri": "https://demo.signageos.io/smil/zones/files/img_5.jpg",
    "localUri": "smil/images/img_5_37da4499.jpg"
  },
  "startedAt": "2024-11-19T21:18:28.781Z",
  "succeededAt": "2024-11-19T21:18:29.483Z",
  "failedAt": null,
  "errorMessage": null
}
```

**Fail**

```json
{
  "type": "SMIL.FileDownloaded",
  "itemType": "image",
  "source": {
    "filePath": {
      "path": "smil/images/img_5_37da4499.jpg",
      "storage": "internal"
    },
    "uri": "https://demo.signageos.io/smil/zones/files/img_5.jpg",
    "localUri": "smil/images/img_5_37da4499.jpg"
  },
  "startedAt": "2024-11-19T21:18:28.781Z",
  "succeededAt": null,
  "failedAt": "2024-11-19T21:18:29.483Z",
  "errorMessage": "HTTP 502"
}
```

#### Playback

**Success**

```json
{
  "type": "SMIL.MediaPlayed",
  "itemType": "image",
  "source": {
    "filePath": {
      "path": "http://localhost:8090/indexed_db/218603c29e5e7275a238c43a1422a9b19188752893c12c5128//internal/smil/images/img_4_762d1382.jpg",
      "storage": ""
    },
    "uri": "http://localhost:8090/indexed_db/218603c29e5e7275a238c43a1422a9b19188752893c12c5128//internal/smil/images/img_4_762d1382.jpg?__smil_version=310446_0",
    "localUri": "http://localhost:8090/indexed_db/218603c29e5e7275a238c43a1422a9b19188752893c12c5128//internal/smil/images/img_4_762d1382.jpg"
  },
  "startedAt": "2024-11-19T21:18:36.342Z",
  "endedAt": "2024-11-19T21:18:41.357Z",
  "failedAt": null,
  "errorMessage": null
}
```

**Fail**

```json
{
  "type": "SMIL.MediaPlayed",
  "itemType": "video",
  "source": {
    "filePath": {
      "path": "http://localhost:8090/indexed_db/218603c29e5e7275a238c43a1422a9b19188752893c12c5128//internal/smil/images/img_4_762d1382.jpg",
      "storage": ""
    },
    "uri": "http://localhost:8090/indexed_db/218603c29e5e7275a238c43a1422a9b19188752893c12c5128//internal/smil/images/img_4_762d1382.jpg?__smil_version=310446_0",
    "localUri": "http://localhost:8090/indexed_db/218603c29e5e7275a238c43a1422a9b19188752893c12c5128//internal/smil/images/img_4_762d1382.jpg"
  },
  "startedAt": "2024-11-19T21:18:36.342Z",
  "endedAt": null,
  "failedAt": "2024-11-19T21:18:41.357Z",
  "errorMessage": "HTTP 500"
}
```

Playback failures always carry `errorMessage: "HTTP 500"` — free-text error descriptions are not emitted.

#### General error

```json
{
  "type": "SMIL.Error",
  "failedAt": "2024-11-19T21:18:31.996Z",
  "errorMessage": "No sensors specified for nexmosphere triggers: []"
}
```

### How to retrieve logs from api

You need to make `GET` request on endpoint

```xml
/v1/device/{{deviceUid}}/applet/{{appletUid}}/command
```

Used in: [Setting Up Reporting](../guides/reporting/setup.md)

## Custom endpoint payloads

`type="manual"` reports POST to a custom endpoint when one is configured — via the `endpoint` field of the
`<meta log>` switchboard, or device-side via the [`reportUrl`](./applet-config.md#reporturl) applet configuration
option. See [`log` / `type` / `endpoint`](./meta-attributes.md#log--type--endpoint) for the enabling semantics.

### Offline storage and retries

Whenever a POST to the endpoint fails — the device is offline, or the endpoint answers with a non-2xx status — the
report is saved to local storage instead of being lost. Stored reports are uploaded in bulk (up to 100 reports per
file) on the next reporting pass once the endpoint is reachable again. Reports that were re-uploaded from offline
storage carry an extra field so you can distinguish them from live reports:

```json
{ "name": "media-playback", "...": "...", "isOfflineReport": true }
```

The batch file size and upload-watcher timing are controlled by the
[`reportFileLimit`](./meta-attributes.md#reportfilelimit) meta attribute.

### Report batching

Playback reports for an individual element can be routed to batched local CSV storage instead of sent immediately —
see [`reportMode`](./element-attributes.md#reportmode) in the Element Attribute Reference.

### Logged events

- Each real file download (`media-download`) — internal copy/restore operations are not reported
- Each media playback (`media-playback`)
- Each download of the SMIL file itself (`playlist-download`)
- Each (re)start of SMIL playlist processing (`playlist-playback`)

### Payload of messages

All custom endpoint reports include a `status` field containing the HTTP status code and a `time` field with a Unix
timestamp in **seconds**. The `url` field contains the content URL used for the report (the final URL after
redirects — see [Reported URL](#reported-url-useinreporturl) below). The `customId`, `type`, `fileName` and `tags`
fields appear only when the corresponding `pop*` attribute is set on the element.

**How to detect failures:** check the `status` field. Playback failures are reported with `status: 500`; download
failures carry the HTTP error status of the failed request (or `502` when the download itself threw). The
`playbackSuccess` field is currently always `true` and should not be used for failure detection.

#### Download (`media-download`)

```json
{
  "name": "media-download",
  "playbackSuccess": true,
  "customId": "customId",
  "type": "video",
  "tags": [
    "tag1",
    "tag2",
    "https://cdn.example.com/video.mp4"
  ],
  "fileName": "video.mp4",
  "status": 200,
  "time": 1732060768,
  "url": "https://cdn.example.com/video.mp4"
}
```

A failed download has the same shape with the error status in `status` (e.g. `502`).

#### Playback (`media-playback`)

```json
{
  "name": "media-playback",
  "playbackSuccess": true,
  "customId": "customId",
  "type": "image",
  "tags": [
    "tag1",
    "tag2",
    "https://cdn.example.com/image.jpg"
  ],
  "fileName": "banner.jpg",
  "status": 200,
  "time": 1732060768,
  "url": "https://cdn.example.com/image.jpg"
}
```

A failed playback has the same shape with `"status": 500`.

#### Playlist records

The SMIL file itself produces two record types (minimal shape — the SMIL element carries no `pop*` attributes):

```json
{ "name": "playlist-download", "playbackSuccess": true, "status": 200, "time": 1732060768, "url": "https://example.com/playlist.smil" }
```

```json
{ "name": "playlist-playback", "status": 200, "time": 1732060768, "url": "https://example.com/playlist.smil" }
```

`playlist-playback` is sent each time the player starts (or restarts) processing the playlist; a `status` of `902`
indicates the SMIL file could not be parsed.

Used in: [Setting Up Reporting](../guides/reporting/setup.md)

## Native proof-of-play payloads

PoP reports contain the fields derived from the `pop*` attributes on each media element (see
[Proof of play](./element-attributes.md#proof-of-play) in the Element Attribute Reference). The `tags` array
includes the `popTags` values followed by the content's final URL and an ISO timestamp.

> **Note:** when a `<meta endpoint>` or the `reportUrl` applet config is set, `type="manual"` reports are POSTed to
> that custom endpoint instead, with an extended payload that includes HTTP `status`, epoch `time`, and `url` fields
> — see [Custom endpoint payloads](#custom-endpoint-payloads) above. The examples below show the native signageOS
> PoP payload used when no custom endpoint is configured.

### Download

```json
{
  "name": "media-download",
  "playbackSuccess": true,
  "customId": "customId",
  "type": "video",
  "tags": [
    "tag1",
    "tag2",
    "https://cdn.example.com/video.mp4",
    "2024-11-19T21:59:28.977Z"
  ],
  "fileName": "video.mp4"
}
```

### Playback

```json
{
  "name": "media-playback",
  "playbackSuccess": true,
  "customId": "customId",
  "type": "image",
  "tags": [
    "tag1",
    "tag2",
    "https://cdn.example.com/image.jpg",
    "2024-11-19T21:48:08.633Z"
  ],
  "fileName": "banner.jpg"
}
```

### How to retrieve the reports

Native PoP reports are delivered through the signageOS proof-of-play pipeline and retrieved via the signageOS
reporting APIs / Box. (The `/v1/device/{{deviceUid}}/applet/{{appletUid}}/command` endpoint retrieves
[standard event reports](#standard-events), not PoP reports.)

Used in: [Proof of Play](../guides/reporting/proof-of-play.md)

## Reported URL (`useInReportUrl`)

`useInReportUrl` is an internal field the player maintains for each media element: during every update check it
stores the **final URL after redirects** (the `Location` target when `updateMechanism="location"` is used), and
reports use that value instead of the raw `src`. This happens automatically — reports for redirected content always
show the real final URL.

Because the player overwrites this field on every update check, setting `useInReportUrl` manually in the SMIL only
has an effect for elements that are never update-checked: **streams** and live-website `<ref>` elements. For all
normal downloaded media, treat it as a reporting output, not an authorable attribute. See
[Custom endpoint payloads](#custom-endpoint-payloads) above for how it appears in payloads.
