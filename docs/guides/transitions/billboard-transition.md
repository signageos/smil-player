# Billboard Transition

Transition definition is placed inside `<layout>` tag in SMIL file `<head>`.

- The `xml:id` or `transitionName` is the ID of the transition used later in the playlist
- `type` defines the behavior of the transition. Only `billboard` is currently supported
- `subtype` visualization of the transition. Only `billboard` is currently supported
- `dur` duration of the transition ( How long it will take to transition from one image to another). Specified in
  seconds, *supports* decimal values ( 0.6s )
- `columnCount` number of columns in the billboard which will be animated
- `direction` direction of the animation. Currently supported values are `left` and `right`

```xml

<layout>
    <transition xml:id="billboard" type="billboard" subtype="billboard" dur="1s" columnCount="50"
                direction="left"/>
    <root-layout width="960" height="360"/>
    <region regionName="cm1kk7rmk0005bfefhlh9hqb6" left="0" top="0" width="960" height="360" z-index="1"
    />
</layout>
        <!-- later when you want to use the transition on the image element -->
<img src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg" region="main"
     dur="6s" transIn="billboard"/>
```

### Default transition

SMIL player supports default transition for the whole playlist. It is defined in the `<head>` tag of the SMIL file.
The transition will be applied to all images in the playlist that do not have a different transition defined directly.

```xml

<meta defaultTransition="transitionID"/>
<layout>
<transition xml:id="transitionID" type="billboard" subtype="billboard" dur="1s" columnCount="50"
            direction="left"/>
<root-layout width="960" height="360"/>
<region regionName="cm1kk7rmk0005bfefhlh9hqb6" left="0" top="0" width="960" height="360" z-index="1"
/>
</layout>

```

Value in defaultTransition attribute is the ID of the transition defined in the layout tag. It has to match.
