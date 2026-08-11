---
sidebar_position: 3
---

# Playability Gate (playCheckUrl)

Attribute reference: [`playCheckUrl`](../../reference/element-attributes.md#playcheckurl),
[`playCheckSkipOnError`](../../reference/element-attributes.md#playcheckskiponerror), and the required
[`skipPlaybackOnHttpStatus`](../../reference/meta-attributes.md#skipplaybackonhttpstatus) meta attribute hold the
strict per-attribute semantics. This page covers how the gate behaves operationally.

Operationally, the gate is a single GET check that runs right before each play and only ever affects *that one
pass* — it never touches downloads, caching, or update checks. See the `playCheckUrl` reference entry linked above
for the exact request/response contract.

```xml
<head>
    <meta http-equiv="Refresh" content="60" skipPlaybackOnHttpStatus="403,404,410"/>
</head>
...
<!-- default: plays if the gate server is unreachable (fail-open) -->
<video src="https://cdn.example.com/campaign.mp4"
       playCheckUrl="https://api.example.com/play-check/campaign"
       dur="30s" region="main"/>
<!-- strict: also skips on gate transport error or unlisted 5xx -->
<video src="https://cdn.example.com/exclusive.mp4"
       playCheckUrl="https://api.example.com/play-check/exclusive"
       playCheckSkipOnError="true"
       dur="30s" region="main"/>
```

Behaviour summary:

- **Skip is per-pass, recovery is automatic.** The gate is re-checked before every play; the moment the server answers
  with an unlisted status again, the element plays. No persistent skip state is kept.
- **Fail-open by default, per-element override.** Network error, timeout, or CORS failure → the element plays from
  cache. An HTTP status *not* in the list — including 5xx — also plays. For strict per-element opt-in instead of
  fail-open, see [`playCheckSkipOnError`](../../reference/element-attributes.md#playcheckskiponerror).
- **Activates on its own.** The attribute works with or without `checkBeforePlay`. With `checkBeforePlay` +
  `checkAheadCount`, updates ride the lookahead while the gate still fires inline right before play — two independent
  request channels (updates use HEAD, the gate uses GET). Expect the gate to add roughly one round-trip before each
  gated play.
- **Timeout is shared with the update checks.** The gate GET uses the `<meta timeOut>` value (default 2000 ms). A
  hanging gate endpoint therefore stalls each gated play in that region for up to the full timeout before
  fail-opening (or skipping, with `playCheckSkipOnError="true"`) — keep the gate endpoint fast, and keep `timeOut`
  low if you raise it for slow update origins. The full response body must arrive before the status is evaluated, so
  keep gate responses small — see the [`playCheckUrl`](../../reference/element-attributes.md#playcheckurl) reference
  entry for exactly how a slow body counts against the timeout.
- **CORS required.** The gate request is a browser XHR: the gate endpoint must send
  `Access-Control-Allow-Origin` (and allow `GET`). A gate endpoint without CORS fails at the network layer and
  fail-opens — the gate silently never gates, and the only symptom is a debug-log network error. With
  `playCheckSkipOnError="true"` the same misconfiguration silently *always skips* instead: the element never plays
  until CORS is fixed — verify the gate endpoint's CORS before opting an element in.
- **Sync groups.** Each device queries the gate independently. Keeping devices in a sync group consistent is the gate
  server's contract: it must answer the same for all devices of a group; the player does not reconcile diverging
  answers. Note that consistent *answers* are necessary but not sufficient — a transport failure on one device
  (timeout → fail-open → plays, or → skips with `playCheckSkipOnError`) while another gets a definitive answer
  also diverges the decisions. A slow or
  flapping gate endpoint therefore causes periodic desync churn that the sync engine has to recover from via resync;
  gate endpoints serving sync groups must be fast and reliable, not just consistent.
- **No proof-of-play** for a gate-skipped pass — see the `playCheckUrl` reference entry linked above for the
  reporting-payload contract.
- **Priority interplay — do not rely on lower-priority fallback rotation.** A gate-closed element inside a higher
  `priorityClass` releases its priority slot on every skipped pass (no deadlock), but each pass still contends for the
  region before the gate answer arrives and interrupts the lower class with the `higher` rule. In practice the lower
  playlist paints at most its first element and the region then stays frozen on the last painted content until the
  gate reopens — and if the gate is closed from the very start of playback, the region can stay empty. Schedule gated
  content with `wallclock` windows (or gate all peers consistently) instead of expecting a lower `priorityClass` to
  rotate behind a long-closed gate.

**Recommended status contract:** serve **200**/204 to play, and reserve 4xx for deliberate gate decisions — see
[`skipPlaybackOnHttpStatus`](../../reference/meta-attributes.md#skipplaybackonhttpstatus) for the exact code list
and rationale (why 5xx, 3xx, and 401 are all poor choices for the gate).

## See also

- [Check Before Play](check-before-play.md) — how the gate relates to the checkBeforePlay/checkAheadCount update channel
- [Updating Content](updating-content.md) — the separate content-update-detection mechanism the gate does not affect
