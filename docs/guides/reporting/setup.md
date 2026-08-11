---
sidebar_position: 1
---

# Setting Up Reporting

SMIL player has the option to turn on logging of major events happening during playlist lifecycle — file downloads,
media playback, and playlist (re)starts. The advantage of this feature is that you can track what's happening with
your content, how it's being used, and (for proof-of-play) gather data for billing purposes.

Attribute reference: [`log` / `type` / `endpoint`](../../reference/meta-attributes.md#log--type--endpoint) and
[`reportFileLimit`](../../reference/meta-attributes.md#reportfilelimit) in the `<meta>` Attribute Reference,
[`reportUrl`](../../reference/applet-config.md#reporturl) in the Applet Configuration Reference, and
[`reportMode`](../../reference/element-attributes.md#reportmode) in the Element Attribute Reference hold the exact
defaults and per-attribute semantics. This page is the task narrative for turning reporting on.

## Choosing `standard`, `manual`, or both

The `type` attribute on the `<meta log>` tag picks which report family the player generates: the built-in
`standard` event stream, `manual` proof-of-play reporting (see [Proof of Play](proof-of-play.md)), or both at once
by listing them comma-separated. See the
[`log` / `type` / `endpoint`](../../reference/meta-attributes.md#log--type--endpoint) reference entry for the
default used when `type` is omitted and how unknown values are handled.

```xml
<meta log="true" type="manual,standard" endpoint="testingEndpoint"/>
```

## Native pipeline vs. a custom endpoint

With no `endpoint` set, reports are delivered through signageOS's own reporting pipeline — `standard` events go
through `command.dispatch` (retrieved via the API, see
[Standard events](../../reference/reporting-payloads.md#standard-events)); `manual` reports go through the
signageOS proof-of-play pipeline (see [Proof of Play](proof-of-play.md)).

To send reports to your own server instead, add an `endpoint` to the `<meta>` tag:

```xml
<meta log="true" type="manual" endpoint="customUrlEndpoint"/>
```

The SMIL player POSTs each batch of reports as a JSON array to that URL:

```javascript
fetch("https://stage.customEndpoint.com/api/webhooks/device-proof-of-play/cm0w686jl009si1l4jcxhhiey/proof-of-play-event", {
	"headers": {
		"content-type": "application/json",
	},
	"body": "[{\"name\":\"media-playback\",\"playbackSuccess\":true,\"type\":\"video\",\"tags\":[\"ckr1u68ig890351znnshenikir\",\"cm0w686jl009si1l4jcxhhiey\",\"cm34j6ldy0035ib6ryzevjwsi\",\"https://cdn.example.com/video.mp4\"],\"status\":200,\"time\":1732146902,\"url\":\"https://cdn.example.com/video.mp4\"}]",
	"method": "POST"
});
```

You can also set the endpoint device-side with the `reportUrl` applet configuration option instead of (or as well
as) the SMIL `endpoint` — see [`reportUrl`](../../reference/applet-config.md#reporturl) for exactly how the two
interact, and the [Applet Configuration Reference](../../reference/applet-config.md) for setting applet config in
general.

## Offline behavior and batching

Custom-endpoint POSTs that fail — device offline, or a non-2xx response — are queued to local storage instead of
being lost, and per-element playback reports can be routed to batched CSV storage instead of being sent immediately
via the `reportMode` attribute. See
[Custom endpoint payloads](../../reference/reporting-payloads.md#custom-endpoint-payloads) in the Reporting Events
& Payloads reference for the offline-retry mechanics, batch file limits, and upload timing.

## See also

- [Proof of Play](proof-of-play.md) — tagging elements and retrieving proof-of-play data
- [Reporting Events & Payloads](../../reference/reporting-payloads.md) — event lists and payload shapes
