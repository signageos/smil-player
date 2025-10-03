---
sidebar_position: 7
---
# Debugging
There are two ways to enable detailed development logs from the SMIL Player runtime:

## Method 1: Configuration Parameter (Recommended)
The easiest way to enable debug logs is through the SMIL Player configuration:

1. In your Applet Timing Configuration, set the `debugEnabled` parameter to "true"
2. Debug logs will automatically appear in the console
3. Set to "false" or remove the parameter to disable logging

```
debugEnabled: "true"
```

This method is ideal for:
- Production troubleshooting without code changes
- Temporary debugging sessions
- Remote device diagnostics

## Method 2: Local Storage (Development)
For development and testing, you can also enable logs via browser Local Storage:

```javascript title="Enabling dev logging"
// Enable debug logs for SMIL Player
localStorage.setItem("debug", "@signageos/smil-player:*");

// Once the debugging is over, disable the logs
localStorage.removeItem("debug");
```

In Chrome, press F12 on an active Emulator window. This will open up a Chrome debugger. In the debugger navigate into the Console tab and paste there the two lines of code above. Once done, refresh the Emulator window.

If your want to debug on devices, enable [Native debug](https://docs.signageos.io/hc/en-us/articles/4416366711442) to access device debug console and apply the code there.

:::caution
Enabling debug logs might affect device performance for certain tasks. Never keeps debug logs enabled on production device.
:::

# FAQ
**CORS settings while developing on Emulator**

If you run into issues while developing SMIL Player within Emulator, make sure you add https://2.signageos.io into the whitelisted domains on your server.

**Videos are not playing in background**

The possibility to play videos in background is currently under review. As of now, you can workaround the missing layering by force all videos to run in background.

- Open the parameters.ts file
- Change `background: false` to `background: true` https://github.com/signageos/smil-player/blob/master/config/parameters.ts#L6
- Build and upload this adjusted version

# Known limitations:
- you cannot layer videos