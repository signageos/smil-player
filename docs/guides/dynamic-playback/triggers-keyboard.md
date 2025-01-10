# Triggers using Keyboard

From v1.4.0, you can use keyboard key presses as a trigger for activating content playback in the SMIL Playlist.

## Using keyboard to trigger content

### Define a trigger based on a key press sequence

- The `origin` is always set as `keyboard`.
- `data` defines the key sequence pressed on the keyboard (in the example below the trigger will become active if your
  press 5 times `a`)
- The action is always set to `keyUp`.

You can define any number of triggers with various `data`. Each `data` has to be unique, and one `data` should not be
a substring of the other.
a substring of another.

```xml

<trigger id="trigger1" condition="or">
    <condition
            origin="keyboard" <!-- Trigger origin, now keyboard -->
    data="aaaaa" <!-- Key string to match -->
    action="keyUp" <!-- keyboard action, probably fixed -->
    />
</trigger>
```

### Define region for triggered content

Read more about regions for triggered content in the
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

### Define content triggered by the keyboard trigger

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

its possible to specify trigger duration either by **dur** attribute which takes values in seconds, or by **repeatCount
** attribute which counts each play of the trigger.
** attribute, which counts each play of the trigger.

```xml

<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  
    -->
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

By default, a trigger is canceled by itself when it's finished playing or by another trigger that was triggered later.
If

you want to cancel a trigger prematurely, without running any other trigger, you can specify the **end** attribute with
the same
value specified in **begin** attribute. This way when you press sequence to activate trigger which is already playing,
it will be canceled, and the SMIL player will resume the original playback.

```xml

<par>
    <!-- referencing <trigger id="trigger1"> defined in <head>  
    -->
    <seq begin="trigger1" end="trigger1" repeatCount="4">
        <video src="https://demo.signageos.io/smil/zones/files/video_1.mp4"
               region="trigger-region"> <!-- As a region you always set the parent of the sub-regions -->
        </video>
    </seq>
</par>
```
