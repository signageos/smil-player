---
sidebar_position: 5
---

# Streams and Video Inputs

If no `dur` attribute is specified on a stream or video input element, it plays indefinitely — until the stream
disconnects or errors, at which point the playlist moves on. See [`dur`](../../reference/element-attributes.md#dur)
for the value format.

## Network streams

With signageOS SMIL Player you can play video streams in various formats, if those are
[supported by the device you are using](https://docs.signageos.io/hc/en-us/articles/4405387483026).

For signageOS SMIL Player to correctly recognize a `<video>` element as a stream, it must carry `isStream="true"` —
see [`isStream`](../../reference/element-attributes.md#isstream) for the full attribute contract. Watch the footgun:
the mere **presence** of the attribute is what triggers stream mode, so `isStream="false"` is *also* treated as a
stream — remove the attribute entirely for regular video files.

The streaming protocol is derived automatically from the URL scheme; there is no attribute to set it. Streams are
played live from the network — they are never downloaded, cached, or update-checked.

**Supported formats:**

- UDP (mpeg2-ts)
- RTP
- RTSP
- HLS
- HTTP
- RTMP

```xml
<video src="udp://{ip}/{endpoint}" isStream="true" />
<video src="rtp://{ip}/{endpoint}" isStream="true" />
<video src="rtsp://{ip}/{endpoint}" isStream="true" />
<video src="hls://{ip}/{endpoint}" isStream="true" />
<video src="http://{ip}/{endpoint}" isStream="true" dur="10" />
```

## HDMI / DP / DVI inputs

signageOS SMIL Player supports showing video inputs like HDMI or DisplayPort on devices that support this
functionality (SoC displays like Samsung Tizen, LG webOS). Inputs also require `isStream="true"`:

```xml
<video src="internal://hdmi1" isStream="true" dur="10" />
```

| Value | Description |
|-------|-------------|
| `internal://hdmi` | HDMI |
| `internal://dp` | DisplayPort |
| `internal://dvi` | DVI |
| `internal://pc` | PC or VGA |

Video inputs are shown live; they are not affected by the
[`videoBackground`](../../reference/applet-config.md#videobackground) option and are never pre-prepared in the
background.
