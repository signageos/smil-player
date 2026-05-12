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

### Lookahead via `checkAheadCount`

Without a lookahead, the HEAD check for element _N_ happens right before element _N_ plays — which can visibly delay the transition while the HEAD (and any triggered download) completes. Set `checkAheadCount` to have the player check the element _N_ positions ahead while the current element is still playing:

```xml
<meta http-equiv="Refresh" content="60" checkBeforePlay="true" checkAheadCount="2"/>
```

With `checkAheadCount="2"`, while element _K_ is playing the player issues a single HEAD for element _K+2_. The lookahead **wraps around** modulo the playlist length, so an indefinite `<seq>` checks every slot, including the last few items (they are checked when the start of the playlist plays). If the target element is already known to be missing (a previous HEAD returned 404 and `skipContentOnHttpStatus` skipped it), the lookahead cascades forward to the next non-skipped element instead — still firing only one HEAD per playback transition.

Updates are discovered via this lookahead; the subsequent background download and commit may land later — up to the next full iteration of the playlist. Worst-case detection latency is roughly `checkAheadCount × average_element_duration`. Lower `checkAheadCount` keeps the HEAD closer to the moment the change becomes visible; higher values give slow networks more lead time to finish the download before the element plays.

## When to use

This option is useful when content freshness at playback time matters more than update latency — for example:

- Playlists with long-duration items where polling might miss a mid-cycle update.
- Infrequent loop cycles where you want to guarantee the latest version plays on the next iteration.
- Scenarios where you want to reduce unnecessary network traffic from polling media files that haven't changed.

## Important

`checkBeforePlay` replaces the interval-based media update mechanism; it does not add a second check on top of it. Media
files are only checked right before they are played, not on a timer.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
