# Passing parameters to SMIL widgets

The SignageOS SMIL Player enables users to pass custom parameters to SMIL widgets. Here is a brief guide on how to
accomplish this:

1. Define your SMIL file and all necessary elements
2. Create a widget element
3. Include the source URL for the widget with parameters

    1. Parameters in the URL are defined after the "?" symbol and are always in a key-value pair format, as in a
       standard query string.

Example:

```xml

<seq>
    <ref src="https://website.com/production/modules/a1b2c3.wgt?appUrl=https%3A%2F%2Fanotherwebsite.com%2Fapi%2Fgraphql&amp;uniqueId=xyz123abcjhkl&amp;"
         type="application/widget" duration="10s" region="left"/>
</seq>
```
