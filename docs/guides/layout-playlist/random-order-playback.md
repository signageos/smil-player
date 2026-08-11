---
sidebar_position: 4
---

# Random playback

The SMIL player offers functionality to specify a play mode for a specific playlist in the player's XML definition file.
This
feature is useful when you want to play content in a random order or randomly pick one element from the specified
playlist.

## Play modes

SMIL player supports three types of play modes:

- **random** - In every time player reaches segment, the SMIL player shuffles the playlist and plays the whole playlist
  in a random
  order.
- **random_one** - In every time player reaches segment, the SMIL player randomly picks one element from the playlist
  and plays
  only that element.

- **one** - In every time player reaches segment, the SMIL player plays only one element from the playlist. In the next
  playback
  cycle, the SMIL player will pick the element that comes directly after the previous one. This behavior continues until
  the end of the playlist, after which it will start again from the beginning.

The value is case-insensitive; an unknown value plays the whole playlist in normal order.

## Playlist definition

Play mode is specified in the `playMode` attribute of the `seq` element. The children may be plain media elements, or
`<seq>`/`<par>` groups when one "element" should consist of several media played together — with `one` and
`random_one`, each child group counts as a single pick:

```xml

<seq playMode="one">
    <seq>
        <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"
               region="main"/>
    </seq>
    <seq>
        <img dur="3s"
             src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg"
             region="main" fit="fill"/>
        <img dur="3s"
             src="https://demo.signageos.io/smil/samples/assets/landscape2.jpg"
             region="main" fit="fill"/>
    </seq>
    <seq>
        <img src="https://demo.signageos.io/smil/zones/files/img_1.jpg"
             dur="3s" region="main"/>
    </seq>
</seq>
```

```xml

<seq playMode="random">
    <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"
           region="main"/>
    <img dur="3s"
         src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg"
         region="main" fit="fill"/>
    <img dur="3s"
         src="https://demo.signageos.io/smil/samples/assets/landscape2.jpg"
         region="main" fit="fill"/>
</seq>
```

> **Limitation of `playMode="random"`:** shuffling works on playlists whose children are plain media elements (as in
> the example above). Nested `<seq>`/`<par>` children are *not* reshuffled — they play in their defined order. Use
> `random_one` (which fully supports nested children) if you need random selection of grouped content.

## Synchronized playback

`playMode="one"` works together with [multi-device synchronization](../synchronization/playback-synchronization.md):
in a synced region, the coordination master broadcasts which element it picked, and the other devices play the same
one — so randomised playlists stay identical across the whole sync group.
