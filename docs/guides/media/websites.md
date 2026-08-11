---
sidebar_position: 4
---

# HTML5 websites

signageOS SMIL Player supports playback of HTML5 content by default.

## Simple HTML Page

A simple HTML page is represented by a URL to the HTML document. The page can be played using the following code:

```xml
<ref src="http://server/index.html" type="text/html" dur="indefinite"/>
```

Note that the **media files referenced from the HTML document are external and are NOT cached on the device** after
power cycling.

If the network is not available after the player restarts, the referenced media files would be unavailable for display.

To make the complete HTML5 page cached in the player and available to play when the network is not available,
use a [widget](widgets.md) instead.

## Important remarks

- Websites are rendered in an iframe — make sure the website allows being embedded (no `X-Frame-Options`/CSP
  restrictions)
- Whether a `<ref>` is treated as a live website or as a cached [widget](widgets.md) is decided by the URL's
  file extension: `.wgt`, `.zip`, `.ipk`, `.apk` are widget archives; anything else is a live website. The `type`
  attribute does not affect this decision
- Websites keep their original URL including query parameters; they are never downloaded or update-checked
