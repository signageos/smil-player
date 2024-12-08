# Triggers using mouse or touch display

From v1.6.1, you can use onClick/onTouch events as a trigger for activating content playback in a SMIL Playlist.

## Using onClick/onTouch to trigger content

- The `origin` is always set as `mouse`
- `data`: no data specified in this case. A SMIL file can have only one onClick/onTouch trigger per playlist.
- `action` is always set to `click`

You can define any number of triggers with various `data` values. Each `data` must be unique, and one `data` should not
be
a substring of another.

```xml

<trigger id="trigger1" condition="or">
    <condition
            origin="mouse"
            action="click"
    />
</trigger>
```

### Define region for triggered content

Read more about regions for triggered content in
the [Triggers article](https://docs.signageos.io/hc/en-us/articles/4405241368978).

```xml

<layout>
    <!-- define the screen resolution -->
    <root-layout width="1920" height="1080" backgroundColor="#18182c"/>

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
    <!-- referencing <trigger id="trigger1"> defined in <head>      -->
    <seq begin="trigger1">
        <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

### Trigger duration

It's possible to specify trigger duration either by the `dur` attribute, which takes values in seconds, or by the
`repeatCount`
attribute, which counts each play of the trigger.

```xml

<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>      -->
    <seq begin="trigger1" repeatCount="4">
        <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
    <seq begin="trigger2" dur="10">
        <video src="https://demo.signageos.io/smil/zones/files/video_2.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```

### Trigger cancellation

By default, a trigger is cancelled by itself when it's finished playing or by another trigger that was triggered later.
If
you want to cancel a trigger prematurely, without running any other trigger, you can specify the `end` attribute with
the same
value specified in the `begin` attribute. This way, when you perform a mouse click to activate a trigger that's already
playing, it will be cancelled, and the SMIL player will resume original playback.

```xml

<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>      -->
    <seq begin="trigger1" end="trigger1" repeatCount="4">
        <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```
