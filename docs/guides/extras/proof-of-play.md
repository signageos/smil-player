# Proof of Play and Logging

Smil player has option to turn on logging of major events which are happening during playlist lifecycle.

## Setup

To turn logs on, you have to specify `<meta>` tag with log value in smil header.

```xml
<meta log="true"/>
```

## Logged events

- each file download successful/unsuccessful
- each media playback successful/unsuccessful
- each media playback started and finished
- some major errors ( trigger initialization, sensors etc...)


## How to retrieve logs from api

You need to make `GET` request on endpoint

```xml
/v1/device/{{deviceUid}}/applet/{{appletUid}}/command
```
