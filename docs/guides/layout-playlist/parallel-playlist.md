---
sidebar_position: 3
---
# Parallel Playlist

The SMIL parallel playlist is a list of media objects that start playback simultaneously.

Children of the parallel playlist can be specified to start at a specific "wallclock" time defined by the player's real-time clock. See the section on [Wallclock](../scheduling/wallclock-scheduling.md) for details.

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

> Parallelism is effectively **per region**: children of a `<par>` targeting *different* regions run concurrently
> (as above), while media elements placed directly in a `<par>` but sharing the *same* region still play one after
> another — a region shows one element at a time. For parallel playback, structure the `<par>` as one child
> `<seq>`/`<par>` per region.

> A classic a-smil pattern pairs a slide show `<seq>` with a background `<audio>` track inside the same `<par>`. The
> `<audio>` tag is **not supported** by the signageOS SMIL Player, though — see
> [Not supported](../../reference/supported-features.md#audio-playback). Play the slide show as a plain `<seq>`
> instead; it will run silently.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
