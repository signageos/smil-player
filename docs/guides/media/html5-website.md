# HTML5 websites

signageOS SMIL Player supports playback of HTML5 content by default.

## Simple HTML Page

A simple HTML page is represented by an URL to the HTML document. The page can be played using the following code:

```xml
<ref src="http://server/index.html" type="text/html" dur="indefinite" />
```

Note that the **media files referenced from the HTML document are external and are NOT cached on the device** after power cycling.

If the network is not available after the player restarts, the referenced media files would be unavailable for display.

To make the complete HTML5 page cached in the player and available to play when the network is not available, use [HTML5 Widget](https://docs.signageos.io/hc/en-us/articles/4414003715090).

## Important remarks
- Websites are often rendered via iframe, make sure that the website can be loaded this way
