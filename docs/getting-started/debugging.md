---
sidebar_position: 3
---
# Debugging
There are two ways to enable detailed development logs from the SMIL Player runtime:

## Method 1: Configuration Parameter (Recommended)
The easiest way to enable debug logs is through the SMIL Player configuration:

1. In your Applet Timing Configuration, set the `debugEnabled` parameter to "true"
2. Debug logs will automatically appear in the console
3. Set to "false" or remove the parameter to disable logging

```text
debugEnabled: "true"
```

The `debugEnabled` option is listed in the [Applet Configuration Reference](../reference/applet-config.md).

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

To debug a specific component only, replace the wildcard with the component name, e.g.
`localStorage.setItem("debug", "@signageos/smil-player:filesModule")`. Debug objects for each component are stored
in the `tools` folders, plus there is a debug object in the main file `index.ts`.

In Chrome, press F12 on an active Emulator window. This will open up a Chrome debugger. In the debugger navigate into the Console tab and paste there the two lines of code above. Once done, refresh the Emulator window.

If your want to debug on devices, enable [Native debug](https://docs.signageos.io/hc/en-us/articles/4416366711442) to access device debug console and apply the code there.

:::caution
Enabling debug logs might affect device performance for certain tasks. Never keeps debug logs enabled on production device.
:::

## FAQ

**CORS settings while developing on Emulator**

If you run into issues while developing SMIL Player within Emulator, make sure you add https://2.signageos.io into
the whitelisted domains on your server.