# Check Before Play

## What it does

Instead of relying on periodic HEAD-request polling to detect media updates, the player checks each media file for
updates immediately before playing it. This ensures content is always fresh at the moment of playback.

## How it works

- Right before a media element (video, image, widget) is played, the player makes a HEAD request to check if the source
  file has changed.
- If an update is detected, the new file is downloaded and committed before playback begins.
- Interval-based media checking is automatically disabled (`onlySmilUpdate` is forced to `true` internally) — only the
  SMIL file itself is still polled on the refresh interval.

## How to enable

Add the `checkBeforePlay="true"` attribute to the `<meta>` tag in the SMIL `<head>`:

```xml

<smil>
    <head>
        <meta http-equiv="Refresh" content="60" checkBeforePlay="true"/>
    </head>
    <!-- Additional elements here -->

</smil>
```

You can combine it with other `<meta>` attributes such as `expr`:

```xml

<meta http-equiv="Refresh" content="60" checkBeforePlay="true" expr="adapi-weekday()<=4"/>
```

> ### Note
> When `checkBeforePlay` is enabled, there is no need to set `onlySmilUpdate="true"` explicitly — the player sets it
> automatically. The periodic refresh interval (`content`) still applies to the SMIL file itself.

## When to use

This option is useful when content freshness at playback time matters more than update latency — for example:

- Playlists with long-duration items where polling might miss a mid-cycle update.
- Infrequent loop cycles where you want to guarantee the latest version plays on the next iteration.
- Scenarios where you want to reduce unnecessary network traffic from polling media files that haven't changed.

## Important

`checkBeforePlay` replaces the interval-based media update mechanism; it does not add a second check on top of it. Media
files are only checked right before they are played, not on a timer.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
