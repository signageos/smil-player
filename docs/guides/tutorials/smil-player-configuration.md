---
sidebar_position: 5
---
# SMIL Player Configuration
You can configure certain parameters of the SMIL Player using Timing Configuration. Here is the list of built-in options:

- `smilUrl` is used for passing URL of the smil file, no default
- `backupImageUrl` is used for defining a failover image that will be shown in case the smil file is corrupted or fatal error occurs during playback, default built-in image
- `serialPortDevice` is used for defining custom device address used for serial communication (like Nexmosphere sensors), default is /device/ttyUSB0
- `videoBackground` this value accepts True and False values, resulting in a video content playing in the background
- `debugEnabled` enables detailed debug logging to console for troubleshooting purposes, accepts "true" or "false" values (default: false)

![SMIL Applet configuration via timing config](config.png)

## Debug Logging

The `debugEnabled` parameter controls debug logging output:

### When to Enable Debug Logs
- Troubleshooting playback issues
- Diagnosing content loading problems
- Understanding playlist sequencing
- Investigating update check behavior
- Debugging trigger and conditional playback

### Important Considerations
- **Performance**: Debug logging can impact performance, especially on lower-end devices
- **Storage**: Extensive logs may consume browser console memory
- **Production**: Disable debug logs in production unless actively troubleshooting

### Example Configuration
To enable debug logging, set `debugEnabled` to "true" in your timing configuration:

```
debugEnabled: "true"
```

Debug logs will then appear in the browser console with detailed information about:
- File downloads and caching
- Playlist processing
- Content updates
- Playback state changes
- Error conditions