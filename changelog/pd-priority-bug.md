### Added

- (public) `events` attribute on `<meta log>` — comma-separated list of report events to send to the custom endpoint (or
  save to the offline log). When set, only the listed events are reported; when absent or empty, the default set is
  used (`media-download`, `media-playback`, `playlist-download`, `playlist-playback`). Unknown names are ignored.
  Applies to the custom endpoint only
- (public) New opt-in report events, sent only when listed in `events`: `media-copied` (content reused for another URL
  without a new download), `media-moved` (content found under a new URL, nothing downloaded), `media-restored`
  (content restored from device storage instead of re-downloaded), `media-deleted` (stored content removed by
  playlist cleanup or storage eviction), `media-skipped` (element skipped for one pass by its `playCheckUrl` gate).
  Payload has the same shape as `media-download`
- (public) `logger` applet config key — selects where the player's diagnostic output goes: `console` (default) or
  `remote`. `remote` batches every log line and POSTs them as JSON to the `loggerUrl` applet config key every
  5 seconds, so logs can be collected from devices without access to a developer console. Both honour
  `debugEnabled`, so logging is switched on and off from device config without a redeploy. Switching between loggers
  needs no rebuild. The remote logger keeps one request in flight at a time with a 10 s timeout, so a slow log server
  costs the device dropped log batches, never piled-up connections

### Changed

- (public) Log levels now mean something: failures the player recovers from (download errors, playback errors, sync
  setup or coordination failures, storage and migration errors, trigger initialisation failures) are logged at
  `error`, and degraded-but-handled conditions (local fallback after an HTTP error, skipped content, insufficient
  storage, sync timeouts, invalid SMIL kept out by `fallbackToPreviousPlaylist`, unsupported elements) at `warn`.
  Everything else stays `debug`. All levels are still gated only by `debugEnabled`, so nothing disappears from the
  console or the remote log stream; in the browser console the promoted lines now show as warnings and errors

### Fixed

- (public) Media was never downloaded on Tizen 2.4 since 4.0.0 when another file of the same type (e.g. the intro
  image) was already stored — the element was skipped or showed that other file's content, and an image playlist
  stayed on its intro image. Devices already affected need their applet storage wiped once after the update
- (public) Player did not start on Chrome 38 devices (webOS 3.x and older) since 4.0.0 — the screen stayed blank with
  `TypeError: undefined is not a function` in the log
- (public) Updated media was not downloaded when its Last-Modified date (or Location URL) matched a file that had been
  removed from the device earlier, or matched the SMIL file itself; the element was then skipped on every pass, even
  across player restarts. Such content is now downloaded; genuinely moved content (file still on device) is still
  copied instead of re-downloaded
- (public) A higher-priority wallclock campaign could be interrupted by lower-priority content: a lower element could
  slip in between two `repeatCount` passes of the campaign (when the player started inside an already-open window,
  e.g. after a SMIL update, applet restart or reboot) and then alternate with the campaign for the rest of the
  window, and a lower video that was just starting when the campaign began could cover the campaign and play to its
  end. Lower and `defer`/`never` sibling content now waits for the whole active window of the playing campaign
- (public) A priority campaign with a future wallclock `begin` that arrived via a SMIL update (not at player start)
  never played when it was a `<par>` directly under a `priorityClass` or the only wallclock element in its class
- (public) An element with a conditional `expr` (e.g. a dayparted campaign) lost its condition after a single
  `skipContentOnHttpStatus` skip and played unconditionally from then on
- (public) Regions could freeze on a stale frame when an element was skipped and recovered, or after a report was sent
  for it, because the player briefly treated it as a different element; deeply nested playlists could also be
  confused with each other in priority handling
- (public) `log="false"` now really disables custom-endpoint reporting — previously reports were still sent whenever
  `type="manual"` and an `endpoint` were configured
- (public) The first `playlist-playback` report after start was dropped when logging was configured only via
  `<meta log>`
- (public) `media-download` / `playlist-download` reports sent before first playback contained a `null` tag (and a
  shifted URL field) when `useInReportUrl` was not set; the element's `src` is now used, matching playback reports
