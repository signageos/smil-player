# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to
[Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `playCheckSkipOnError` per-element attribute — with `"true"`, a `playCheckUrl` gate transport error (server
  unreachable/timeout) or unlisted 5xx status skips the pass instead of the default fail-open; listed statuses and
  other unlisted statuses behave as before. Only meaningful next to `playCheckUrl`; default `false` keeps today's
  behavior

### Changed

- `playCheckUrl` playability gate sends GET instead of HEAD (some gate backends do not answer HEAD); still only the response status code is evaluated

## [4.0.0] - 2026-07-29

### Added

- `checkAheadCount` meta attribute — pre-checks a content slot a configurable number of positions ahead so updated
  media is downloaded before it is due to play
- `playCheckUrl` per-element playability gate — a dedicated URL HEAD-checked right before each play; when the status
  is listed in the new `<meta skipPlaybackOnHttpStatus>` (required, independent of `skipContentOnHttpStatus`), the
  element is skipped for that pass only and recovers automatically. Pure play/skip control with zero effect on
  downloads or update checks; fails open (plays from cache) on network errors and unlisted statuses
- cross-trigger cancellation — a trigger can now stop content started by a different trigger
  (`begin="trigger1" end="trigger2"`), for widget, mouse, and keyboard triggers
- reports uploaded from offline storage are now flagged with `isOfflineReport`
- `checkBeforePlay` meta attribute to check each media file for updates right before playback instead of periodic
  polling
- `reportUrl` applet configuration option for custom reporting endpoint
- HTTP status codes in custom endpoint and standard event download reports
- batch download optimization with content deduplication for location header strategy
- storage preservation system for content movement detection — avoids re-downloading when content moves to a new URL

### Changed

- **BREAKING:** the custom report (`reportUrl`) payload format changed: proof-of-play entries now include the HTTP
  `status` and the played `url`, and use a numeric epoch `time` field in place of the previous `recordedAt` ISO
  timestamp; a `playlist-playback` record is now sent each time the SMIL playlist (re)starts; the `SyncWait`
  event-report type was removed. Consumers reading `recordedAt` must migrate to `time`
- reduced startup time by checking media files for updates in parallel instead of one at a time
- download reports are now sent only for real network downloads, not for internal copy or restore operations
- content whose URL returns a status listed in `skipContentOnHttpStatus` is no longer downloaded or error-reported

### Fixed

- hardened `skipContentOnHttpStatus` / `skipPlaybackOnHttpStatus` / `updateContentOnHttpStatus` meta parsing: malformed
  values (wrong separator, non-numeric entries, boolean-coerced `"true"`) no longer crash SMIL parsing or silently
  produce never-matching status lists — invalid entries are dropped and a fully malformed list behaves as absent
- fixed synchronized devices freezing on a black screen when a sync-group peer was temporarily on a different SMIL
  version (e.g. during a staged content-update rollout) — the device now keeps playing its own content and re-syncs
  automatically once the peers are back on the same version
- fixed nested `<par repeatCount="indefinite">` regions playing once and then freezing on their last frame when a
  sibling branch runs its own indefinite loop
- fixed gallery and repeatCount-based playlists freezing on their last element after a content update (parent-identity
  drift and lost play-count tracking)
- fixed `expr`-disabled media leaving a phantom "playing" region that could deadlock other regions
- fixed wallclock `begin` times more than ~24 days in the future activating immediately and jumping the playlist ahead
  instead of waiting for their scheduled window
- fixed video playback not recovering when an internal stop() call fails — playback is now retried
- fixed an updated video continuing to play the old file, and the internal video-player pool filling up until playback
  hung permanently, when a looping video was replaced during a content update
- fixed playback stopping permanently when a video failed to open and never reported that it had ended — an upper
  bound is now applied when no duration information is available
- fixed a synchronized region freezing on a stale frame for many minutes when the sync master became unreachable —
  after repeated failed coordination attempts the region continues playing on its own and rejoins the group
  automatically once coordination messages arrive again
- fixed synchronized devices freezing on a stale frame after a scheduled higher-priority campaign window closed —
  every paused lower-priority playlist is now released, not just the most recent one
- fixed regions playing the wrong content after a player restart when two playlist slots had swapped their media
  between restarts
- fixed in-use media being evicted from storage and re-downloaded when Location-header URLs carried changing query
  parameters
- fixed a burst of update-check requests per playback cycle when `checkAheadCount` was used on a playlist containing
  unavailable content
- fixed proof-of-play reports showing the wrong URL when the same media file is used in several playlist slots, and
  reports using the SMIL query URL instead of the final Location-header URL
- fixed already-downloaded content being deleted when its URL started returning a status listed in
  `skipContentOnHttpStatus` — the local copy is now preserved and played
- fixed empty SMIL playlists triggering the backup-image fallback; an intentionally empty playlist is now treated as a
  valid state
- fixed the default background image not clearing on the first playback cycle
- fixed priority `higher="pause"` being ignored and always behaving as `stop`
- fixed a lower-priority element incorrectly stopping or pausing the higher-priority content that was playing
- fixed `lower="never"` allowing lower-priority content to appear alongside higher-priority content, against the SMIL
  spec
- fixed priority and dynamic-content races and pause/resume edge cases that could freeze playback or briefly show the
  wrong region — including two peer regions stalling paused without either playing, and a region's normal content not
  resuming after a trigger-activated dynamic insert finished
- fixed competing wallclock-scheduled priority campaigns in sibling `<par>` groups all starting at once and ignoring
  each other's defer/pause/stop rules; each campaign now respects its own `begin`/`end` window, and deferred
  lower-priority content resumes once all campaigns have expired
- fixed `playMode="one"` and `playMode="random_one"` playing all children instead of one when the children are nested
  `<seq>`/`<par>` groups
- fixed the SMIL playlist file deleting itself during a content update and falling back to the backup image
- fixed the backup image not displaying (blank screen) when the SMIL file is invalid or missing
- fixed a `checkBeforePlay` element staying permanently disabled after a single transient 404 — it now recovers on the
  next cycle
- fixed `updateMechanism="location"` filenames and content-update lookahead (extension taken from the Location header,
  the correct upcoming slot is pre-checked, and skipped slots are re-checked)
- fixed a request storm when content stayed unavailable — retries are now paced
- fixed false media re-preparation and a temporary-file race during content refresh cycles
- fixed devices filling up storage: a 100 MB minimum free-space floor is now enforced on every download and copy, free
  space is tracked accurately, and downloads are skipped (instead of retried in a loop) when storage is full
- fixed Tizen AVPlayer playback by not appending the `__smil_version` query to `file://` URIs
- fixed a DOM event-listener leak that accumulated across playlist reloads
- fixed stale region caching and free-region selection for nested trigger regions
- fixed re-firing a widget trigger while its content was already playing spawning duplicate playback loops and leaking
  video event listeners — repeated widget-trigger events are now idempotent
- fixed a ticker animation timeout leak on re-entry and incorrect ticker spacing on first layout
- fixed wallclock scheduling crashing on malformed weekday values, and hardened filename decoding and JSON parsing
  against malformed input
- fixed offline-stored reports not being retried on the next upload pass, SMIL meta logging types being lost when a
  custom `reportUrl` is set, and `reportMode` not propagating to iframe-rendered media
- fixed the promise-chain mutex breaking on a rejected batch commit
- fixed playlist element errors cascading across regions — errors are now isolated per element
- fixed playback errors during updates by copying instead of moving files during storage preservation
- fixed offline report index tracking on startup to avoid overwriting existing reports
- fixed duplicate downloads for URLs differing only in query parameters
- fixed duplicate HEAD requests when update detection had already been performed
- fixed the `forceDownload` flag being ignored when `skipUpdateCheck` is true
- fixed SMIL files being preserved to storage

## [3.2.11] - 2026-04-20

### Added

- rewritten sync protocol from timing-based to ACK-based synchronization for more reliable multi-device sync
- priority-aware sync coordination — sync respects priority level transitions without desynchronizing devices
- playMode=one sync support for sequential content advancement across synchronized devices
- phase-specific sync coordination (prepare, play, finish) for smoother sync transitions
- automatic resync detection and recovery when devices fall out of sync
- improved debug logging across the entire player for better diagnostics

### Changed

- **BREAKING:** the new ACK-based sync protocol is not compatible with the previous timing-based protocol — all
  devices in a sync group must be upgraded together; a mixed-version sync group will not synchronize

### Fixed

- fixed 60-second slave delay on wallclock-triggered priority transitions
- fixed false priority-change detection during SMIL playlist updates
- fixed slave infinite resync loop with playMode=one playlists
- fixed sync index wraparound causing unreachable resync targets
- fixed stale sync messages from previous cycles causing false resyncs
- fixed race conditions in master/slave sync coordination
- fixed last-modified rollback detection to avoid false re-downloads when content is rolled back
- fixed file type lookup not matching correctly due to leading slash
- fixed a crash ("object is not iterable") when a playlist element fell back to the default duration
- fixed a startup crash on Chrome 38 devices caused by unguarded `URLSearchParams`

## [3.2.10] - 2026-02-18

### Added

- add per-element `reportMode` attribute for batch reporting — elements with `reportMode="batch"` save reports to
  offline CSV storage instead of HTTP POST

### Fixed

- fixed batch report files being uploaded before reaching the configured report file limit
- fixed hardcoded report file limit constant instead of using parsed configuration value

## [3.2.9] - 2026-01-21

### Added

- landscape and portrait backup image support with automatic orientation detection

### Fixed

- fixed playlist update, cancel lower version playlist instead of waiting for lower playlist element to finish
- fixed playing cached playlist when device starts offline

## [3.2.8] - 2025-12-03

### Fixed

- fixed offline report files exceeding 100 report limit after device restart
- fixed priority coordination issues causing content overlap during playlist updates

## [3.2.7] - 2025-09-26

### Added

- `updateMechanism` meta attribute with `location` strategy — check for media updates using the Location
  header/redirect URL instead of Last-Modified
- `skipContentOnHttpStatus` and `updateContentOnHttpStatus` meta attributes to skip or force-update content based on
  HTTP status codes
- `contentRefresh` and `smilFileRefresh` meta attributes for separate SMIL file and media content refresh intervals
- per-element update attributes: `updateCheckUrl`, `updateCheckInterval`, `allowLocalFallback`
- `useInReportUrl` per-element attribute to control which URL appears in reports
- `fallbackToPreviousPlaylist` meta attribute to continue playing previous valid playlist when a new SMIL file is
  invalid or empty
- `debugEnabled` applet configuration option
- support for multiple logging types simultaneously (e.g., `type="manual,standard"`)

### Fixed

- fixed widget triggers not working correctly
- fixed SMIL file refresh interval not being applied separately from content refresh
- fixed AbortController compatibility for older devices

## [3.2.6] - 2025-03-26

### Added

- `timeOut` meta attribute for configurable HEAD request timeout (default 2000ms)
- dynamic sync engine selection based on `syncServerUrl`
- parallel file downloads instead of sequential

### Fixed

- fixed handling of trigger sync groups when the playlist contains no sync
- improved file check performance

## [3.2.4] - 2025-04-01

### Fixed

- fix offline reporting bug when device goes repeatedly offline and online

## [3.2.3] - 2024-13-12

### Added

- documentation for new features

### Fixed

- few outdated parts in documentation
- fix wallclock issue with combination of weekday and daily repeat attributes

## [3.2.2] - 2024-15-11

### Changed

- increase interval for sending event reports to 10 minutes

## [3.2.1] - 2024-15-11

### Fixed

- make sending event reports async to avoid blocking playback

## [3.2.0] - 2024-08-10

### Added

- added ISO timestamp to PoP event reports
- added option to specify custom endpoint in smil file header to send PoP event reports to

## [3.1.3] - 2024-29-09

### Changed

- change intro media display process to display intro as soon as possible to avoid black screen during smil player
  startup

### Fixed

- fixed issue with billboard transitions positioning not properly reflecting regions coordinates

## [3.1.2] - 2024-29-09

### Added

- add a timeout for priority sync to avoid rare case when playlist freezes

### Fixed

- fixed issue with default transition and priority content not working properly

## [3.1.0] - 2024-29-09

### Added

- added proof of play (PoP) support
- added multiple sync group for synchronization before sync content plays and after sync content finishes for smoother
  sync transitions
- added billboard transitions support for images
- added option to specify default transition in smil file header ( default transition is used for all images in playlist
  unless different transition is specified)

## [3.0.0] - 2024-24-07

### Changed

- sync index for the content is now computed for the whole regions instead of separate parts of playlist (seq, par tags
- removed __smil_version query string from widgets displaying websites

### Added

- support for dynamic triggers
- upgrade to node v20
- improved performance for older devices
- improve video playback performance
- improved reporting messages
- ability to restart applet when sync service fails
- ability to monitor synchronization with event reports
- added option to start triggers from inside the widget
- event reports now reporting if media is being synchronized with playback on other devices
- upgrade tools like typescript webpack to newer versions
- added random playback support with ability to shuffle content or randomly select content from the playlist
- improve priority types stop and defer performance
- added option to specify default repeat count in smil file header ( default repeat count is used everywhere where
  repeat count
  is not specified )

### Fixed

- bug with conditional expression date and time comparison
- fixed rare occurrence of top priority content flickering when returning to lower priority
- fixed issues with seamless update and top priority content
- fixed prepare of dynamic content on slave playlist devices to ensure gapLess playback
- fixed issue with parent overriding child content in priority playback
- fixed body css bug during smil player start
- fixed issue with wallClock notation when no repeatCount is specified
- fixed issue when priority content specified with wallClock not starting properly
- fixed parent generation bug for dynamic and priority segments
- fixed issues with seamless update and sync content
- fixed rewinding sync content to find the correct one to play with priority defined
- fixed issue with trigger parent window listeners on android devices

## [2.1.0] - 2024-01-15

### Fixed

- fix rare bug which occurs in widget optimization during smil playlist update
- clarification that advanced usage with extra configuration is still in development

### Added

- added option to stop trigger using same triggerId as to invoke it
- change failOver mechanism so all devices take care of broken device
- added ticker implementation
- added markdown documentation for the smil playlist creation and syntax

## [2.0.0] - 2022-05-31

### Fixed

- fixed wallClock and repeatCount=indefinite edge case bug
- fixed background video single loop freeze
- fixed repeatCount issues when combined with priorityClasses and wallClock notations
- fixed relative src path for triggers
- fixed rare bug with multiple triggers using same region not working correctly
- fixed bug with keyboard triggers with specified duration
- fixed transitions with underlying content
- fixed issue when trying to prepare video which no longer exists in localstorage
- fixed rare bug with one widget in playlist not visible after smil update

### Changed

- multiple components code refactor

### Added

- improved seamless update performance
- improved general playback performance
- improved multiple widgets in playlist performance
- added option to turn off preloading of widgets ( widget is loaded at exact time when it should start playing, not
  before)
- added transitions support for widgets
- added support for applet-synchronizer
- added option to synchronize playback among multiple devices in same sync group
- added support for synchronization failOver content ( when one device withing sync group goes offline, other one
  takes care of its playback )
- added new home screen
- added new default backup image
- added option to specify z-index on img or ref tags in smil xml file

### Removed

- removed input form from home screen

## [1.9.1] - 2022-02-15

### Fixed

- added config definition allowing to show required configuration in Box
- added optional z-index attribute to img and ref tag in smil file
- added conditional expression to smil data refresh configuration
- fixed race condition with seamless update
- fixed conditional timeFormat issue
- fixed right and bottom css positioning for regular media and triggers

## [1.9.0] - 2021-10-14

### Fixed

- fixed bug with video playback in background not working properly
- fixed rare bug with malformed files in internal storage
- fixed rare bug with wallClock definitions
- fixed rare bug with wallClock endTime

### Added

- Add bottom option to element positioning
- Add video streaming support

## [1.8.0] - 2021-09-14

### Fixed

- Query parameters of HTML widgets for Brightsign devices
- fixed image transitions bug

### Added

- Add seamless update support

## [1.7.0] - 2021-06-30

### Fixed

- fix bug with non-existing videos failing smil file parse
- fix issue when smil player was stuck on backup image after xml parse failure

### Added

- add option to turn off media update ( set interval as -1)

## [1.6.1] - 2021-06-07

### Fixed

- fix bug with single priorityClass not working properly
- fix rare bug with playing blank image ( no source )

## [1.6.0] - 2021-05-27

### Fixed

- fix bug with default region not having proper name
- fix bug with wrong repeatCount for triggers
- fix bug with parent generation hashing algorithm
- improved intro handling
- improved playlist sanitization
- improve media url validation
- improved conditional expressions handling

### Added

- added smil event reporting support
- added onClick/onTouch triggers with duration specified in seconds
- added support for image to image crossFade transition
- added optional `serialPortDevice` in sos.config to dynamically define device address for serial communication
- added support for fixed video duration
- added support for widgets with query parameters
- added support for auth headers for media download
- added ICS format implementation for conditional expression
- added support for smil files with no active content
- added support for backup image if smil-player fails on smil file download or smil xml parse functionality supports
  image stored directly in smil repo or on remote server.

## [1.5.0] - 2021-04-14

### Fixed

- bug with new parent generated during each iteration of playlist
- bug with one item playlist inside priorityClass

### Added

- improved smil stability
- added logic to remove infinite loops and unnecessary elements
- improve readme and documentation

## [1.4.0] - 2021-03-31

### Fixed

- bug with multiple widgets ids in same region
- bug with widgets extension remaining in code for later media
- multiple components code refactor

### Added

- keyboard support for triggers
- ability to play triggers based on repeatCount attribute
- improved image/widget performance
- improved xml parsing and playlist generation

## [1.3.0] - 2021-03-12

### Fixed

- fixed wrong order when processing sequences of elements without seq or par tags
- improved performance during conditional playback
- fixed cypress tests timeouts

### Added

- added local express server for cypress tests
- added dynamic cypress tests for priority and wallclock

## [1.2.0] - 2021-02-12

### Added

- basic cypress tests support
- advanced conditional expression conditions

### Fixed

- fixed bug with file update blocked by wallClock functions
- fixed bug with one playlist blocking another during wait
- improved performance for LG devices

## [1.1.0] - 2021-01-26

### Added

- trigger support
- webos video playback hotfix with sleep(videoDuration) and Promise.race
- add priority behaviour support (excl and priorityClass tags)
- add conditional playback support
- add improved error handling
- add new instance of playlist during each smil restart
- add lastModified check during media files download at the start of the smil processing
- add check for empty localFilePath during video playback

### Fixed

- fixed smil parsing issue on Rpi
- fixed new smil file download/offline processing
- fixed media files update check
- fixed image intro
- fixed image/widgets update check, add random query string to avoid caching except for brightsign device
- remove navigator.online and replace it with fetch functionality
- fixed edge case bug causing infinite loop when no playlist is active
- fixed wallClock bug for different dates without repeat

## [1.0.1] - 2020-09-17

### Added

- performance optimization for older devices
- add JSDoc, code structure improvements
- improve test coverage

### Fixed

- fix offline playback
- performance improvements for older/slower devices

## [1.0.0] - 2020-08-31

### Added

- First released version, supported features in readme or https://docs.signageos.io/category/smil-guides

## [0.0.1] - 2020-03-01

### Added

- Initial PoC release of SMIL player
