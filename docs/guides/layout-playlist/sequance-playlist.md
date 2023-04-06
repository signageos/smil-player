---
sidebar_position: 2
---

# Sequence Playlist

The sequential playlist is the simplest form of playlists in SMIL.

In a sequential playlist, media objects are played in the order they are listed in the SMIL playlist. One media object starts playing after the preceeding one ends.

## Simple loop

```xml
<seq repeatCount="indefinite">

  <video src="ad1.mpg" region="main"/>
  <video src="ad2.mpg" region="main"/>
  <img src="ad3.png" dur="5s" region="main"/>

</seq>
```

Loop 2 videos and 1 JPEG indefinitely.

## Nested loop

```xml
<seq repeatCount="indefinite">

  <video src="ad1.mpg" region="main"/>

  <seq repeatCount="2">
    <video src="ad2.mpg" region="main"/>
    <img src="ad3.png" dur="5s" region="main"/>
  </seq>

</seq>
```

Plays the sequence: ad1, ad2, ad3, ad2, ad3 and repeats the entire sequence endlessly.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
