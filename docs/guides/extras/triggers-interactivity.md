# Triggers and Interactivity

Triggers allow defining set of rules for triggering specific `seq` or `par` playlist.

## Defining Triggers

The `<triggers>` element define a pool of individual `<trigger>` tags.

- whenever the `<condition>` is `TRUE`, trigger is set as *activate*.
- whenever the `<condition>` is `FALSE`, trigger is set as *deactivate*.

> The `id` of the `<trigger>` has to be unique and start with *trigger* key word - e.g. trigger1, trigger-my-content, triggerABC.

```xml
<head>
    <triggers>
        <trigger id="trigger1" condition="or">
            <!-- 
            If sensor - RFID antenna rfid1- emits
            that user picked up an RFID tag with ID 1 
            condition is set to TRUE 
            and trigger activated
             -->
            <condition 
                origin="rfid1" <!-- Trigger origin, usually defined in <sensor/> tag -->
                data="1" <!-- Data passed from origin sensor, in this case RFID tag ID -->
                action="picked" <!-- user action emitted by the origin sensor -->
            />
        </trigger>
        <!-- you can add as many triggers as you need -->
        <trigger id="trigger2" condition="or">
            <!-- also number of condition is limited only by device performance -->
            <condition origin="rfid1" data="2" action="picked"/>
            <condition origin="rfid1" data="3" action="picked"/>
            <condition origin="rfid5" data="4" action="picked"/>
            <condition origin="rfid6" data="5" action="picked"/>
        </trigger>
    </triggers>

</head>
```

## Mandatory Sub-Regions for triggered playlist

To make sure triggers will work fine with other non triggered content in other regions, you **have to define** a `sub-region` where the triggered playlists are going to be played.

Any triggered playlist will be played in the `trigger-sub-region1`.

> The `regionName` can be named as you want. There is no restriction.

More about general usage of [Regions can be found here](https://docs.signageos.io/hc/en-us/articles/4405241028114). This is an advanced use case.


### Usage of the sub-regions

Sub-region is defined a child tag of another `<region>`.

```xml
<region regionName="trigger-region">
    <region regionName="trigger-sub-region1"/>
</region>
```

1. The `trigger-sub-region1` can completely occupy the parent `<region>`:

```xml
<region regionName="trigger-region" left="10" top="10" width="1280" height="720">
    <!-- Single sub-region filling the parent region completely -->
    <region regionName="trigger-sub-region1" 
            left="0" 
            top="0" 
            width="100%" 
            height="100%"
    />
</region>
```

2. The `trigger-region` can be split into multiple `sub-regions`.

```xml
<region regionName="trigger-region" left="10" top="10" width="1280" height="720">
    <!-- Two sub-regions positioned relatively to the parent region -->
    <region regionName="trigger-sub-region1" 
            left="0" 
            top="0" 
            width="50%" 
            height="100%"
    />
    <region regionName="trigger-sub-region2" 
            left="50%" 
            top="0" 
            width="50%" 
            height="100%"
    />
</region>
```

Having multiple `sub-regions` allows you to play **multiple triggered content** with a dynamic location. The example flow of the dynamically assigning sub-regions is as follows:

1. first, `trigger2` will start playback in the first available sub-region of the `trigger-region` -> `trigger-sub-region1`
1. secondly, `trigger1` will be initiated while still having `trigger2` activated -> the playlist for `trigger1` will be automatically assigned to the `trigger-sub-region2`

> Triggered playlist is always looking for the first available (empty) sub-region. If no sub-region is available (all are occupied by the previously triggered playlists), it overrides the first sub-region.

## Triggering content

To trigger content by the pre-defined `triggers` use trigger `id` in the `begin` attribute of the `<seq>` or `<par>` element.

The triggered playlist is automatically stopped whenever the condition defined in `<head>` is no longer `TRUE`.

> For media and other elements **always set region attribute to the parent one**. Never use sub-regions in the region attribute.

```xml
<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  -->
    <seq begin="trigger1"> 
        <video src="smil/zones/files/video_3.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
        <video src="/smil/zones/files/video_3.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>

<par>
    <!-- referencing <trigger id="trigger2"> defined in <head>  -->
    <seq begin="trigger2"> 
        <video src="smil/samples/assets/landscape1.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

### Duration of the triggered content

If you need the triggered content to play more than one time, you can adjust the number of playback by using `repeatCount`:

```xml
<par>
    <!-- referencing <trigger id="trigger2"> defined in <head>  -->
    <seq begin="trigger2" repeatCount="3"> 
        <video src="smil/samples/assets/landscape1.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

Or you can specify `dur` attribute to determine exactly how long should be trigger playing. Dur is specified in seconds.

```xml
<par>
    <!-- referencing <trigger id="trigger2"> defined in <head>  -->
    <seq begin="trigger2" dur="30"> 
        <video src="smil/samples/assets/landscape1.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```
