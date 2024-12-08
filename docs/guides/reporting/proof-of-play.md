# SMIL Proof of Play

SMIL player has the option to turn on logging of major events which are happening during the playlist lifecycle.

The advantage of this feature is that you can track what is happening with your content, how it is being used, and

## Setup

To turn logs on, you have to specify `<meta>` tag with log value in smil header.

```xml

<head>
    <meta log="true" type="manual"/>
</head>
```

### PoP attributes for each element you want reports for in smil playlist

### PoP attributes for each element you want reports for in smil playlist

separated by comma which will

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

### Download

#### Success

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

#### Fail

```json
{
  "name": "media-download",
  "customId": "customId",
  "type": "video",
  "tags": [
    "ckr1u68ig890351znnshenikir",
    "cm0w686jl009si1l4jcxhhiey",
    "cm2x29v78001y48p4xfpi97cu",
    "cm2x1xfz2001t48p43qqoiav0",
    "2024-11-19T21:48:08.633Z"
  ],
  "fileName": "video.mp4",
  "errorMessage": "File not found"
}
```

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
    "cm2x1xfz2001t48p43qqoiav0",
    "2024-11-19T21:48:08.633Z"
  ],
  "fileName": "video.mp4"
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
    "cm2x1xfz2001t48p43qqoiav0",
    "2024-11-19T21:48:08.633Z"
  ],
  "fileName": "video.mp4",
  "errorMessage": "Unsupported video type"
}
```

### General error

```json
{
  "type": "SMIL.Error",
  "failedAt": "2024-11-19T21:18:31.996Z",
  "errorMessage": "No sensors specified for nexmosphere triggers: []"
}
```

## How to retrieve logs from api

```xml
/v1/device/{{deviceUid}}/applet/{{appletUid}}/command
```
