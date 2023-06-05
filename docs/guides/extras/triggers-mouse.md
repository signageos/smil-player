# Triggers using mouse or touch display

From v1.6.1 you can use onClick/onTouch events as a trigger for activating content playback in SMIL Playlist.

## Using onClick/onTouch to trigger content

- The `origin` is always set as `mouse`
- `data` no data specified in this case. Smil file can have only one onClick/onTouch trigger per playlist
- `action` is always set to `click`

You can define any number of the triggers with various `data`. Each `data` has to be unique and one `data` should not be a substring of the other.

```xml
<trigger id="trigger1" condition="or">
    <condition 
        origin="mouse" <!-- Trigger origin, now mouse -->
        action="click" <!-- keyboard action, probably fixed -->
    />
</trigger>
```

### Define region for triggered content

Read more about regions for triggered content in the [Triggers article](https://docs.signageos.io/hc/en-us/articles/4405241368978).

```xml
<layout>
    <!-- define the screen resolution -->
    <root-layout width="1920" height="1080" backgroundColor="#18182c" />

    <region regionName="trigger-region" left="10" top="10" width="1280" height="720">
        <!-- Single sub-region filling the parent region completely -->
        <region regionName="trigger-sub-region1" 
                left="0" 
                top="0" 
                width="100%" 
                height="100%"
            />
    </region>
</layout>
```

### Define content triggered by the trigger

```xml
<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  
        "aaaaa" is not a mandatory naming
    -->
    <seq begin="trigger1"> 
        <video src="aaaaa.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

### Trigger duration

its possible to specify trigger duration either by `dur` attribute which takes values in seconds, or by `repeatCount` attribute which counts each play of the trigger.

```xml
<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  
        "aaaaa" is not a mandatory naming
    -->
    <seq begin="trigger1" repeatCount="4"> 
        <video src="aaaaa.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>        <seq begin="trigger2" dur="10"> 
        <video src="aaaaa.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

### Trigger cancellation

By default, trigger is cancelled by itself when its finished playing or by another trigger which was triggered later. If you want to cancel trigger prematurely, without running any other trigger, you can specify `end` attribute with same value specified in `begin` attribute. This way when you perform mouse click to activate trigger which is already playing, it will be cancelled and smil player will resume original playback.

```xml
<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  
        "aaaaa" is not a mandatory naming
    -->end="trigger1"
    <seq begin="trigger1" end="trigger1" repeatCount="4"> 
        <video src="aaaaa.mp4" 
            region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>    
</par>
```
