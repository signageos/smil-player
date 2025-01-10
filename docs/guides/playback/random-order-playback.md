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
  order.
- **random_one** - In every time player reaches segment, the SMIL player randomly picks one element from the playlist
  and plays
  only that element.

- **one** - In every time player reaches segment, the SMIL player plays only one element from the playlist. In the next
  playback
  cycle, the SMIL player will pick the element that comes directly after the previous one. This behavior continues until
  the end of the playlist, after which it will start again from the beginning.

## Playlist definition

Play mode is specified in the `playMode` attribute of the `seq` element.

```xml

<seq playMode="one">
    <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4"
           region="main" soundLevel="0%"/>

    <img dur="3s"
         src="https://demo.signageos.io/smil/samples/assets/landscape1.jpg"
         region="main" fit="fill"/>
    <img dur="3s"
         src="https://demo.signageos.io/smil/samples/assets/landscape2.jpg"
         region="main" fit="fill"/>
    <img src="https://demo.signageos.io/smil/zones/files/img_1.jpg"
         dur="3s" fit="hidden" region="main">
        <param name="cacheControl" value="auto"/>
    </img>
    <img src="https://demo.signageos.io/smil/zones/files/img_2.jpg"
         dur="3s" fit="hidden" region="main">
        <param name="cacheControl" value="auto"/>
    </img>
</seq>
```
