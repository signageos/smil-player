---
sidebar_position: 2
---

# Sequence Playlist

The sequential playlist is the simplest form of playlists in SMIL.

In a sequential playlist, media objects are played in the order they are listed in the SMIL playlist. One media object
starts playing after the preceding one ends. Use the [`repeatCount`](../../reference/element-attributes.md#repeatcount)
attribute to loop a `<seq>` — `indefinite` repeats it forever, as in the examples below.

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

> Keep nested `<seq>`/`<par>` groups contiguous (next to each other) when mixing them with plain media inside one
> `<seq>` — see [`repeatCount`](../../reference/element-attributes.md#repeatcount) for the parser behavior behind
> this rule.

## Default repeat count

A `<seq>`/`<par>` without its own `repeatCount` plays once by default. Set
[`defaultRepeatCount`](../../reference/meta-attributes.md#defaultrepeatcount) in the SMIL `<head>` to change that
default for the whole playlist.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
