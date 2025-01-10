# HTML5 App (aka Widget)

signageOS SMIL Player supports HTML5 content by default.

## Basic usage

An HTML Widget is a **zipped HTML5 file system tree** containing at the top level the file named "index.html" which can
refer to other files using relative URLs within the zipped tree.

A widget is loaded into a Player as a self-contained media file and **is cached in the player's storage** for offline
playback. It can be accessed using the following code:

```xml

<ref src="http://server/content.wgt" type="application/widget" dur="indefinite"/>
```

Here is an example file structure of the widget with nested folders and files:

```Text
- images
    --- logo.png
    - assets
    --- js
    ------ bundle.js
    ------ jquery.js
    --- css
    ------ styles.css
    - index.html
```

## Passing parameters to SMIL widgets

SignageOS SMIL Player allows its users to pass custom parameters into your SMIL widgets. Here is a short guide on how
you can do this:

1. Define your SMIL file and all necessary elements
2. Create a widget element
3. Add source URL for the widget with parameters
    1. Parameters within URL are defined after the ? symbol and always in a Key - Value pair, these parameters are
       defined in a standard Query string

Example:

```xml

<seq>
    <ref src="https://website.com/production/modules/a1b2c3.wgt?appUrl=https%3A%2F%2Fanotherwebsite.com%2Fapi%2Fgraphql&amp;uniqueId=xyz123abcjhkl&amp;"
         type="application/widget" dur="10s" region="left"/>
</seq>
```

### How to read parameters in the widget

```javascript
// https://example.com/path/to/page?color=purple&size=M&size=L
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);


urlParams.get('color')     // purple
urlParams.getAll('size')   // ['M', 'L']
```

**Example of widgets:**

- [Simple HTML widget](https://github.com/signageos/applet-examples/tree/master/smil/demos/zones/bottomWidget)
- [Complex HTML App using signageOS JS SDK](https://github.com/signageos/applet-examples/tree/master/smil/demos/car_rental_sensors/kiosk/car-check-in-widget)

## Using signageOS JS SDK within Widget

The great benefit of the widget is the possibility to use
signage [signageOS JS SDK](https://developers.signageos.io/sdk) within the widget. It allows you to:

- communicate with RS232 and sensors
- adjust LED stripes
- cache files
- access file system
- and much more....

### How to allow signageOS JS SDK in the Widget

sos is undefined and cannot use the JS SDK. In case you do not have sos object available, you need to manually add it to
your project by one of the following options:

**Option A)**

``` xml
import sos from '@signageos/front-applet';
```

**Option B)**

``` xml
const sos = require('@signageos/front-applet');
```

**Option C)**

``` xml
<script src="..path/to/the/front-applet.js" />
```

You can manually download the library here: https://2.signageos.io/lib/front-applet/4.15.0/bundle.js. You can also
download any other version by changing the 4.15.0.
to [another version that is available](https://docs.signageos.io/hc/en-us/articles/4409188685074).
