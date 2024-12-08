# Crossfade Transition

Transition definition is placed inside `<layout>` tag in SMIL file `<head>`.

- The `xml:id` or `transitionName` is the ID of the transition used later in the playlist
- `type` defines the behavior of the transition. Only `fade` is currently supported
- `subtype` visualization of the transition. Only `crossfade` is currently supported
- `dur` duration of the transition (How long it will take to transition from one image to another). Specified in

  seconds, *supports* decimal values (0.6s)

```xml

<layout>
    <!-- Transition definition -->
    <transition transitionName="bwt" type="fade" subtype="crossfade" dur="1s"/>

    <!-- Standard layout definition -->
    <root-layout height="1080" width="1920"/>
    <region regionName="video" left="10" top="10" width="1280" height="720"></region>
</layout><!-- later when you want to use the transition on the image element -->
<img src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg" region="main"
     dur="6s" transIn="bwt"/>
```

### Default transition

SMIL player supports default transition for the whole playlist. It is defined in the `<head>` tag of the SMIL file.
The transition will be applied to all images in the playlist that do not have a different transition defined directly.

```xml

<meta defaultTransition="transitionID"/>
<layout>
<transition xml:id="transitionID" type="fade" subtype="crossfade" dur="1s"/>
<root-layout width="960" height="360"/>
<region regionName="video" left="0" top="0" width="960" height="360" z-index="1"
/>
</layout>

```

The value in the defaultTransition attribute is the ID of the transition defined in the layout tag. It has to match.
