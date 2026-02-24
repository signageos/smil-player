# SMIL Proof of Play

SMIL player has the option to turn on logging of major events which are happening during the playlist lifecycle.

The advantage of this feature is that you can track what is happening with your content, how it is being used, and
gather proof-of-play data for reporting and billing purposes.

## Setup

To turn logs on, you have to specify `<meta>` tag with log value in smil header.

```xml

<head>
    <meta log="true" type="manual"/>
</head>
```

### PoP attributes

Each element you want reports for must have PoP attributes defined in the SMIL playlist. The `popName` attribute is
mandatory — if it is not present, the report will not be sent. All other attributes are optional.

- `popName` — (mandatory) identifier for the media item in reports. Without this attribute, no PoP report is generated.
- `popType` — type label included in the report (e.g., `"video"`, `"image"`).
- `popCustomId` — custom identifier passed through to the report as `customId`.
- `popFileName` — file name included in the report.
- `popTags` — comma-separated list of tags. Sent as an array in the report payload.

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

- each file download successful/unsuccessful
- each media playback successful/unsuccessful

## Payload of messages

PoP reports contain the fields derived from the `pop*` attributes on each media element. The `tags` array includes
the `popTags` values followed by the report URL and an ISO timestamp.

> **Note:** PoP reports (`type="manual"`) do not include success/failure distinction or HTTP status codes. If you need
> download status codes or playback success/failure information, use [Custom Endpoint Reporting](custom-endpoint.md)
> or [Standard Event Reporting](event-reporting.md).

### Download

```json
{
  "name": "media-download",
  "customId": "customId",
  "type": "video",
  "tags": [
    "ckr1u68ig890351znnshenikir",
    "cm0w686jl009si1l4jcxhhiey",
    "cm34j6ldy0035ib6ryzevjwsi",
    "clumdj8st57992mn0dc1umbna",
    "2024-11-19T21:59:28.977Z"
  ],
  "fileName": "video.mp4"
}
```

### Playback

```json
{
  "name": "media-playback",
  "customId": "customId",
  "type": "image",
  "tags": [
    "ckr1u68ig890351znnshenikir",
    "cm0w686jl009si1l4jcxhhiey",
    "cm2x29v78001y48p4xfpi97cu",
    "cm2x1xfz2001t48p43qqoiav0",
    "2024-11-19T21:48:08.633Z"
  ],
  "fileName": "video.mp4"
}
```

## How to retrieve logs from api

```xml
/v1/device/{{deviceUid}}/applet/{{appletUid}}/command
```
