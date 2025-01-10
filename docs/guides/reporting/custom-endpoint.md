# SMIL Custom endpoint reporting

The SMIL player has an option to enable logging of major events occurring during the playlist lifecycle.
The advantage of this feature is that it allows you to track your content's usage and status, and
the SMIL player will report with
custom attributes that you can define in your SMIL playlist.

When a custom endpoint is specified, the SMIL player sends all reports to this endpoint, where you can process them
according
to your needs. Reports are sent as POST requests with the body specified as an array of reports.

## Request example

```javascript
fetch("https://stage.customEndpoint.com/api/webhooks/device-proof-of-play/cm0w686jl009si1l4jcxhhiey/proof-of-play-event", {
	"headers": {
		"content-type": "application/json",
	},
	"body": "[{\"name\":\"media-playback\",\"playbackSuccess\":true,\"type\":\"video\",\"tags\":[\"ckr1u68ig890351znnshenikir\",\"cm0w686jl009si1l4jcxhhiey\",\"cm34j6ldy0035ib6ryzevjwsi\",\"clumdj8st57992mn0dc1umbna\"],\"recordedAt\":\"2024-11-20T22:55:02.599Z\"}]",
	"method": "POST"
});
```

The SMIL player also supports offline caching of reports, so if the device is offline, it will store the reports in
local storage and send them in bulk, 100 reports at a time, when the device goes online again.

## Setup

To enable logging, you must specify a `<meta>` tag with a log value in the SMIL header.
To turn logs on, you have to specify `<meta>` tag with log value in smil header.

```xml

<meta log="true" type="manual" endpoint="customUrlEndpoint"/>
```

### PoP attributes for each element you want reports for in smil playlist

The PopName attribute is mandatory. If it's not present, the report will not be sent. For other attributes, you can
specify custom values that will be included in the report. The popTags attribute is optional, allowing you to specify
multiple tags
separated by commas, which will
be sent as an array in the report.

```xml

<img src="srcToElement"
     dur="15s"
     region="region"
     popName="video1"
     popType="video"
     popCustomId="customId"
     popFileName="First video"
     popTags="tag1,tag2,tag3"/>
```

## Logged events

- Each media playback, successful or unsuccessful

## Payload of messages

### Playback

#### Success

```json
{
  "name": "media-playback",
  "playbackSuccess": true,
  "customId": "customId",
  "type": "image",
  "tags": [
    "ckr1u68ig890351znnshenikir",
    "cm0w686jl009si1l4jcxhhiey",
    "cm2x29v78001y48p4xfpi97cu",
    "cm2x1xfz2001t48p43qqoiav0"
  ],
  "fileName": "video.mp4",
  "recordedAt": "2024-11-19T21:59:28.977Z"
}
```

#### Fail

```json
{
  "name": "media-playback",
  "playbackSuccess": false,
  "customId": "customId",
  "type": "video",
  "tags": [
    "ckr1u68ig890351znnshenikir",
    "cm0w686jl009si1l4jcxhhiey",
    "cm2x29v78001y48p4xfpi97cu",
    "cm2x1xfz2001t48p43qqoiav0"
  ],
  "fileName": "video.mp4",
  "errorMessage": "Unsupported video type",
  "recordedAt": "2024-11-19T21:59:28.977Z"
}
```
