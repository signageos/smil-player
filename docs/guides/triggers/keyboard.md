---
sidebar_position: 2
---

# Triggers using Keyboard

From v1.4.0, you can use keyboard key presses as a trigger for activating content playback in the SMIL Playlist.

## Using keyboard to trigger content

### Define a trigger based on a key press sequence

- The `origin` is always set as `keyboard`.
- `data` defines the key sequence pressed on the keyboard (in the example below the trigger will become active if you
  press 5 times `a`)
- The action is set to `keydown` (the player listens for key-down events; the attribute value itself is informational).

You can define any number of triggers with various `data`. Each `data` has to be unique, and one `data` should not be
a substring of another.

Keys must be pressed in quick succession — the sequence buffer resets if more than **200 ms** pass between two
keystrokes. Modifier and function keys (Shift, Ctrl, Enter, F1–F12, …) are ignored and neither extend nor reset the
sequence.

```xml

<trigger id="trigger1" condition="or">
    <!-- origin: trigger source; data: key string to match; action: keyboard event -->
    <condition origin="keyboard" data="aaaaa" action="keydown"/>
</trigger>
```

For sub-region setup see [Sub-regions](overview.md#sub-regions), for trigger duration (`dur`/`repeatCount`) see
[Trigger duration](overview.md#trigger-duration), and for cancellation (`end`) see
[Cross-trigger cancellation](overview.md#cross-trigger-cancellation).

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
