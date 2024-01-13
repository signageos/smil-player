# HTML5 App (aka Widget)

signageOS SMIL Player supports HTML5 content by default.

## Basic usage

An HTML Widget is a **zipped HTML5 file system tree** containing at the top level the file named "index.html" which can refer to other files using relative URLs within the zipped tree.

A widget is loaded into a Player as a self-contained media file and **is cached in the player's storage** for offline playback. It can be accessed using the following code:

```xml
<ref src="http://server/content.wgt" type="application/widget" dur="indefinite" />
```

Here is an example file structure of the widget with nested folders and files:

```xml
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

**Example of widgets:**

- [Simple HTML widget](https://github.com/signageos/applet-examples/tree/master/smil/demos/zones/bottomWidget)
- [Complex HTML App using signageOS JS SDK](https://github.com/signageos/applet-examples/tree/master/smil/demos/car_rental_sensors/kiosk/car-check-in-widget)

## Using signageOS JS SDK within Widget

The great benefit of the widget is the possibility to use signage [signageOS JS SDK](https://sdk.docs.signageos.io/api/js/content/latest/js-api-introduction) within the widget. It allows you to:

- communicate with RS232 and sensors
- adjust LED stripes
- cache files
- access file system
- and much more....

### How to allow signageOS JS SDK in the Widget
sos is undefined and cannot use the JS SDK. In case you do not have sos object available, you need to manually add it to your project by one of the following options:

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

You can manually download the library here: https://2.signageos.io/lib/front-applet/4.15.0/bundle.js. You can also download any other version by changing the 4.15.0. to [another version that is available](https://docs.signageos.io/hc/en-us/articles/4409188685074).
