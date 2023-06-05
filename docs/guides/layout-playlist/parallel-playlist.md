---
sidebar_position: 3
---
# Parallel Playlist

The SMIL parallel playlist is a list of media objects that start playback simultaneously.

Children of the parallel playlist can be specified to start at a specific "wallclock" time defined by the player's real-time clock. See the section on [Wallclock](https://docs.signageos.io/hc/en-us/articles/4405244572178) for details.

## Basic parallel playback

The following example will play both `<seq>` playlists at the same time. Each `<seq>` is playing in its respective region.

```xml
<par>
    <seq repeatCount="indefinite">
        <img src="pic1.jpg" dur="5s" region="main" />
        <img src="pic2.jpg" dur="5s" region="main" />
        <img src="pic3.jpg" dur="5s" region="main" />
    </seq>

    <seq repeatCount="indefinite">
        <img src="side1.jpg" dur="5s" region="side" />
        <img src="side2.jpg" dur="5s" region="side" />
        <img src="side3.jpg" dur="5s" region="side" />
    </seq>
</par>
```

## Slide Show with Background music

Audio tag is not yet supported.

```xml
<par>

  <seq repeatCount="indefinite">
    <img src="pic1.jpg" dur="5s" />
    <img src="pic2.jpg" dur="5s" />
    <img src="pic3.jpg" dur="5s" />
  </seq>

  <audio src="music.mp3" repeatCount="indefinite" />

</par>
```

The parallel schedule has two children: a sequential playlist containing 3 still images, and a single audio media object. The sequential playlist and the audio object start simultaneously, achieving the effect of a slide show of 3 photos while music plays in the background. The sequential playlist is the simplest form of playlists in SMIL.

In a sequential playlist, media objects are played in the order they are listed in the SMIL playlist. One media object starts playing after the proceeding one ends.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
