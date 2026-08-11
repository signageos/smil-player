---
sidebar_position: 2
---

# Check Before Play

## What it does

Instead of relying on periodic HEAD-request polling to detect media updates, the player checks each media file for
updates immediately before playing it. This ensures content is always fresh at the moment of playback. See the
[`checkBeforePlay`](../../reference/meta-attributes.md#checkbeforeplay) reference entry for exactly what it disables
and forces internally.

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

> ### Note
> You don't need to also set `onlySmilUpdate="true"` — `checkBeforePlay` forces it internally. See the reference
> entry linked above for what stays on the periodic interval and what doesn't.

### Lookahead via `checkAheadCount`

Without a lookahead, the HEAD check for element _N_ happens right before element _N_ plays — which can visibly delay
the transition while the HEAD (and any triggered download) completes. Set `checkAheadCount` to have the player check
the element _N_ positions ahead while the current element is still playing:

```xml
<meta http-equiv="Refresh" content="60" checkBeforePlay="true" checkAheadCount="2"/>
```

See the [`checkAheadCount`](../../reference/meta-attributes.md#checkaheadcount) reference entry for the wrap-around
behavior, recovery re-checks, and worst-case detection latency.

## When to use

This option is useful when content freshness at playback time matters more than update latency — for example:

- Playlists with long-duration items where polling might miss a mid-cycle update.
- Infrequent loop cycles where you want to guarantee the latest version plays on the next iteration.
- Scenarios where you want to reduce unnecessary network traffic from polling media files that haven't changed.

## Relation to the playCheckUrl playability gate

`checkBeforePlay` and the per-element [`playCheckUrl` gate](playability-gate.md) are independent request channels
(the update check uses HEAD, the gate uses GET) that can be combined freely. The update check (this page) decides
whether *content changed* and rides the `checkAheadCount` lookahead when configured; the gate decides whether the
element *plays this pass* and always fires inline right before play — it never rides the lookahead, so its answer is
always fresh. Neither channel reads the other's status-code list (`skipContentOnHttpStatus` vs
`skipPlaybackOnHttpStatus`).

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
