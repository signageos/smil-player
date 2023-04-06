# Passing parameters to SMIL widgets

SignageOS SMIL Player allows its users to pass custom parameters into your SMIL widgets. Here is a short guide on how you can do this:

1. Define your SMIL file and all necessary elements
2. Create a widget element
3. Add source URL for the widget with parameters
    1. Parameters within URL are defined after the ? symbol and always in a Key - Value pair, these parameters are defined in a standard Query string

Example:

```xml
<seq>
   <ref src="https://website.com/production/modules/a1b2c3.wgt?appUrl=https%3A%2F%2Fanotherwebsite.com%2Fapi%2Fgraphql&amp;uniqueId=xyz123abcjhkl&amp;" type="application/widget" dur="10s" region="left"/>
</seq>
```
