# IPTV/Video Streaming

With signageOS SMIL Player you can play video streams with various formats if those are [supported by the device you are using](https://docs.signageos.io/hc/en-us/articles/4405387483026).

## Basic usage

For signageOS SMIL Player to correctly recognize streams, it is necessary to include `isStream="true"` in video tag.

It is possible to specify the duration of the stream in the same way as any other media in SMIL by specifying `dur` attribute.

If no `dur` attribute is specified, the stream will play indefinitely.

**Supported formats:**

- UDP (mpeg2-ts)
- RTP
- RTSP
- HLS
- HTTP

```xml
<video src="udp://{ip}/{endpoint}" isStream="true" />
<video src="rtp://{ip}/{endpoint}" isStream="true" />
<video src="rtsp://{ip}/{endpoint}" isStream="true" />
<video src="hls://{ip}/{endpoint}" isStream="true" />
<video src="http://{ip}/{endpoint}" isStream="true" dur="10" />
```
