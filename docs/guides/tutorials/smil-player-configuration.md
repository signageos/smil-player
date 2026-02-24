---
sidebar_position: 5
---
# SMIL Player Configuration
You can configure certain parameters of the SMIL Player using Timing Configuration. Here is the list of built-in options:

- `smilUrl` is used for passing URL of the smil file, no default
- `backupImageUrl` is used for defining a failover image that will be shown in case the smil file is corrupted or fatal error occurs during playback, default built-in image
- `serialPortDevice` is used for defining custom device address used for serial communication (like Nexmosphere sensors), default is /device/ttyUSB0
- `videoBackground` this value accepts True and False values, resulting in a video content playing in the background
- `reportUrl` custom reporting endpoint URL. When set, the player sends PoP reports to this endpoint regardless of the logging configuration in the SMIL file. Takes precedence over SMIL-configured logging. See [Custom Endpoint Reporting](../reporting/custom-endpoint.md)
- `syncGroupName` identifies which devices should be synchronised together. Can also be set via the SMIL `<meta>` tag, but this config value takes precedence
- `syncServerUrl` URL of the synchronisation server. Can also be set via the SMIL `<meta>` tag, but this config value takes precedence
- `debugEnabled` set to `true` to enable debug logging output (disabled by default)

![SMIL Applet configuration via timing config](config.png)