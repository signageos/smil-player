# Smil player specification
[Smil standard](https://www.a-smil.org/index.php/Main_Page)\
[w3c docs](https://www.w3.org/TR/SMIL3/)

## Sections

### SMIL Media Objects
[A-smil reference](https://www.a-smil.org/index.php/SMIL_Media_Objects)
* All media objects are supported except audio and text. Functionality fo audio is coded and its working, but its commented
out due to interaction with audio of videos.
* Src can be specified with relative path or absolute path. If relative path is specified smil player will combine it with 
actual path to smil file to get absolute one. More in signageOS docs.
* Duration is specified in seconds, either with `s` string or without. Or `indefinite` string.

#### Our changes/limitations
* z-index can be specified directly on element

#### Example
```
<ref src="http://server/index.html" type="text/html" dur="indefinite" />
<video src="ad1.mpg" dur="5" />
<img src="https://some-server.com/ad2.jpg" dur="5s" />
```

### SMIL Playlists
[A-smil reference](https://www.a-smil.org/index.php/SMIL_Playlists)
* All tags are supported and behave by standard specification.

### SMIL Scheduling
[A-smil reference](https://www.a-smil.org/index.php/SMIL_Scheduling)
* All tags are supported and behave by standard specification.

### Layout
[A-smil reference](https://www.a-smil.org/index.php/Layout)
* We are using layout by standard specification.
* Dimensions and positions can be specified by absolute value or by percentages which are computed from display resolution.
* region name is specified by `regionName` or `xml:id` attribute

#### Fit options
```ts
fill = 'fill',
meet = 'contain',
meetBest = 'contain',
cover = 'cover',
objectFit = 'object-fit'
```

#### Our changes/limitations
* we use region definition to specify if content in that region should be synchronized or not = `sync="true"`
* for triggers we use nested regions. See example below or our docs. But basically region has several nested regions, with
dimensions derived from parent region and trigger si dynamically assigned to one of free nested regions. If none is free, trigger will be assigned to first one.

#### Example
```
<region regionName="bottom" left="0" top="1574" width="1080" height="346" z-index="2" sync="true" backgroundColor="#ffffff"/>
<region regionName="main" left="0" top="0" width="1080" height="1920" z-index="1" backgroundColor="#ffffff"/>
<region regionName="trigger" left="0" top="0" width="1080" height="1920" z-index="0" backgroundColor="#ffffff">
    <region regionName="fullScreenTrigger" left="0" top="0" width="1080" height="1920" z-index="0" backgroundColor="#ffffff"/>
</region>
```

### Interactivity
[A-smil reference](https://www.a-smil.org/index.php/Interactivity)
* For interactivity, we use functionality called triggers. Currently, we have keyboard, mouse, nexmosphere sensors and sync failover triggers.
* We handle triggers completely different that in a-smil standard. See our docs for details.

### Video input
[A-smil reference](https://www.a-smil.org/index.php/Video_input)
* We do not use this functionality, you can specify video input by url (relative, absolute) or by stream url, or by hdmi url. See details in our docs.

### Linking SMIL
[A-smil reference](https://www.a-smil.org/index.php/Linking_SMIL)
* Not supported.

### Screen on/off
[A-smil reference](https://www.a-smil.org/index.php/Screen_on/off)
* Not supported.

  * ### Sync Playback
[A-smil reference](https://www.a-smil.org/index.php/Sync_Playback)
* Handled differently, we use applet-synchronizer (our sync server) to sync content.
* Its quite complicated setup see our docs for details.
* Which media should be synced among devices is specified in region definition (see layout section). All content within this region will
synchronized.

### AnyTiles
[A-smil reference](https://www.a-smil.org/index.php/AnyTiles)
* Not supported.

### Pull mode
[A-smil reference](https://www.a-smil.org/index.php/Pull_mode)
* We are using pull mode by standard specification.

#### Our changes/limitations
* Its possible to specify if smil player should check for updates only smil file itself or all media.
`onlySmilUpdate="true"`.
* Its possible to specify conditional expression. Smil player will check for updates only if expression evaluates to true.
`expr="adapi-weekday()&lt;=4"`

#### Example
```
<meta http-equiv="Refresh" content="10" onlySmilUpdate="true" expr="adapi-weekday()&lt;=4"/>
```

### Prefetch
[A-smil reference](https://www.a-smil.org/index.php/Prefetch)
* We dont use this tag during smil processing.

### Reporting
[A-smil reference](https://www.a-smil.org/index.php/Reporting)
* We use our FrontApplet `command.dispatch` for reporting. It has to be allowed in smil file.

#### Example
```
<meta log="true" />
```

### Wallclock
[A-smil reference](https://www.a-smil.org/index.php/Wallclock)
* We are using wallclock by standard specification. See docs or tests in `playlistWallclock.spec.ts` for details.

#### Our changes/limitations
* only supported periodical attribute is `P1D` (once a day).

* ### Transition
[A-smil reference](https://www.a-smil.org/index.php/Transition)
  * We are using transition by standard specification

#### Our changes/limitations
* only supported transition is `crossfade`.
* transition name is specified by `transitionName` or `xml:id` attribute.

### Conditional play
[A-smil reference](https://www.a-smil.org/index.php/Conditional_play)
* Conditional expressions are fully supported. Simple as well as nested ones. For more details see test files `conditionalSimple.spec` and `conditionalAdvanced.spec`

#### Our changes/limitations
* `&lt;` and `&gt;` does not have to be encoded, youo can use directly `<`, `>`
* `adapi-` prefix is not necessary in conditional attributes.
