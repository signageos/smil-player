# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to
[Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- (public) `playCheckSkipOnError` per-element attribute — with `"true"`, a `playCheckUrl` gate transport error (server
  unreachable/timeout) or unlisted 5xx status skips the pass instead of the default fail-open; listed statuses and
  other unlisted statuses behave as before. Only meaningful next to `playCheckUrl`; default `false` keeps today's
  behavior

### Changed

- (public) `playCheckUrl` playability gate sends GET instead of HEAD (some gate backends do not answer HEAD); still only the response status code is evaluated

## [4.0.0] - 2026-07-29

### Added

- (public) `checkAheadCount` meta attribute — pre-checks a content slot a configurable number of positions ahead so updated
  media is downloaded before it is due to play
- (public) `playCheckUrl` per-element playability gate — a dedicated URL HEAD-checked right before each play; when the status
  is listed in the new `<meta skipPlaybackOnHttpStatus>` (required, independent of `skipContentOnHttpStatus`), the
  element is skipped for that pass only and recovers automatically. Pure play/skip control with zero effect on
  downloads or update checks; fails open (plays from cache) on network errors and unlisted statuses
- (public) cross-trigger cancellation — a trigger can now stop content started by a different trigger
  (`begin="trigger1" end="trigger2"`), for widget, mouse, and keyboard triggers
- (public) reports uploaded from offline storage are now flagged with `isOfflineReport`
- (public) `checkBeforePlay` meta attribute to check each media file for updates right before playback instead of periodic
  polling
- (public) `reportUrl` applet configuration option for custom reporting endpoint
- (public) HTTP status codes in custom endpoint and standard event download reports
- (public) batch download optimization with content deduplication for location header strategy
- (public) storage preservation system for content movement detection — avoids re-downloading when content moves to a new URL

### Changed

- (public) **BREAKING:** the custom report (`reportUrl`) payload format changed: proof-of-play entries now include the HTTP
  `status` and the played `url`, and use a numeric epoch `time` field in place of the previous `recordedAt` ISO
  timestamp; a `playlist-playback` record is now sent each time the SMIL playlist (re)starts; the `SyncWait`
  event-report type was removed. Consumers reading `recordedAt` must migrate to `time`
- (public) reduced startup time by checking media files for updates in parallel instead of one at a time
- (public) download reports are now sent only for real network downloads, not for internal copy or restore operations
- (public) content whose URL returns a status listed in `skipContentOnHttpStatus` is no longer downloaded or error-reported

### Fixed

- (public) hardened `skipContentOnHttpStatus` / `skipPlaybackOnHttpStatus` / `updateContentOnHttpStatus` meta parsing: malformed
  values (wrong separator, non-numeric entries, boolean-coerced `"true"`) no longer crash SMIL parsing or silently
  produce never-matching status lists — invalid entries are dropped and a fully malformed list behaves as absent
- (public) fixed synchronized devices freezing on a black screen when a sync-group peer was temporarily on a different SMIL
  version (e.g. during a staged content-update rollout) — the device now keeps playing its own content and re-syncs
  automatically once the peers are back on the same version
- (public) fixed nested `<par repeatCount="indefinite">` regions playing once and then freezing on their last frame when a
  sibling branch runs its own indefinite loop
- (public) fixed gallery and repeatCount-based playlists freezing on their last element after a content update (parent-identity
  drift and lost play-count tracking)
- (public) fixed `expr`-disabled media leaving a phantom "playing" region that could deadlock other regions
- (public) fixed wallclock `begin` times more than ~24 days in the future activating immediately and jumping the playlist ahead
  instead of waiting for their scheduled window
- (public) fixed video playback not recovering when an internal stop() call fails — playback is now retried
- (public) fixed an updated video continuing to play the old file, and the internal video-player pool filling up until playback
  hung permanently, when a looping video was replaced during a content update
- (public) fixed playback stopping permanently when a video failed to open and never reported that it had ended — an upper
  bound is now applied when no duration information is available
- (public) fixed a synchronized region freezing on a stale frame for many minutes when the sync master became unreachable —
  after repeated failed coordination attempts the region continues playing on its own and rejoins the group
  automatically once coordination messages arrive again
- (public) fixed synchronized devices freezing on a stale frame after a scheduled higher-priority campaign window closed —
  every paused lower-priority playlist is now released, not just the most recent one
- (public) fixed regions playing the wrong content after a player restart when two playlist slots had swapped their media
  between restarts
- (public) fixed in-use media being evicted from storage and re-downloaded when Location-header URLs carried changing query
  parameters
- (public) fixed a burst of update-check requests per playback cycle when `checkAheadCount` was used on a playlist containing
  unavailable content
- (public) fixed proof-of-play reports showing the wrong URL when the same media file is used in several playlist slots, and
  reports using the SMIL query URL instead of the final Location-header URL
- (public) fixed already-downloaded content being deleted when its URL started returning a status listed in
  `skipContentOnHttpStatus` — the local copy is now preserved and played
- (public) fixed empty SMIL playlists triggering the backup-image fallback; an intentionally empty playlist is now treated as a
  valid state
- (public) fixed the default background image not clearing on the first playback cycle
- (public) fixed priority `higher="pause"` being ignored and always behaving as `stop`
- (public) fixed a lower-priority element incorrectly stopping or pausing the higher-priority content that was playing
- (public) fixed `lower="never"` allowing lower-priority content to appear alongside higher-priority content, against the SMIL
  spec
- (public) fixed priority and dynamic-content races and pause/resume edge cases that could freeze playback or briefly show the
  wrong region — including two peer regions stalling paused without either playing, and a region's normal content not
  resuming after a trigger-activated dynamic insert finished
- (public) fixed competing wallclock-scheduled priority campaigns in sibling `<par>` groups all starting at once and ignoring
  each other's defer/pause/stop rules; each campaign now respects its own `begin`/`end` window, and deferred
  lower-priority content resumes once all campaigns have expired
- (public) fixed `playMode="one"` and `playMode="random_one"` playing all children instead of one when the children are nested
  `<seq>`/`<par>` groups
- (public) fixed the SMIL playlist file deleting itself during a content update and falling back to the backup image
- (public) fixed the backup image not displaying (blank screen) when the SMIL file is invalid or missing
- (public) fixed a `checkBeforePlay` element staying permanently disabled after a single transient 404 — it now recovers on the
  next cycle
- (public) fixed `updateMechanism="location"` filenames and content-update lookahead (extension taken from the Location header,
  the correct upcoming slot is pre-checked, and skipped slots are re-checked)
- (public) fixed a request storm when content stayed unavailable — retries are now paced
- (public) fixed false media re-preparation and a temporary-file race during content refresh cycles
- (public) fixed devices filling up storage: a 100 MB minimum free-space floor is now enforced on every download and copy, free
  space is tracked accurately, and downloads are skipped (instead of retried in a loop) when storage is full
- (public) fixed Tizen AVPlayer playback by not appending the `__smil_version` query to `file://` URIs
- (public) fixed a DOM event-listener leak that accumulated across playlist reloads
- (public) fixed stale region caching and free-region selection for nested trigger regions
- (public) fixed re-firing a widget trigger while its content was already playing spawning duplicate playback loops and leaking
  video event listeners — repeated widget-trigger events are now idempotent
- (public) fixed a ticker animation timeout leak on re-entry and incorrect ticker spacing on first layout
- (public) fixed wallclock scheduling crashing on malformed weekday values, and hardened filename decoding and JSON parsing
  against malformed input
- (public) fixed offline-stored reports not being retried on the next upload pass, SMIL meta logging types being lost when a
  custom `reportUrl` is set, and `reportMode` not propagating to iframe-rendered media
- (public) fixed the promise-chain mutex breaking on a rejected batch commit
- (public) fixed playlist element errors cascading across regions — errors are now isolated per element
- (public) fixed playback errors during updates by copying instead of moving files during storage preservation
- (public) fixed offline report index tracking on startup to avoid overwriting existing reports
- (public) fixed duplicate downloads for URLs differing only in query parameters
- (public) fixed duplicate HEAD requests when update detection had already been performed
- (public) fixed the `forceDownload` flag being ignored when `skipUpdateCheck` is true
- (public) fixed SMIL files being preserved to storage

## [3.2.11] - 2026-04-20

### Added

- (public) rewritten sync protocol from timing-based to ACK-based synchronization for more reliable multi-device sync
- (public) priority-aware sync coordination — sync respects priority level transitions without desynchronizing devices
- (public) playMode=one sync support for sequential content advancement across synchronized devices
- (public) phase-specific sync coordination (prepare, play, finish) for smoother sync transitions
- (public) automatic resync detection and recovery when devices fall out of sync
- (public) improved debug logging across the entire player for better diagnostics

### Changed

- (public) **BREAKING:** the new ACK-based sync protocol is not compatible with the previous timing-based protocol — all
  devices in a sync group must be upgraded together; a mixed-version sync group will not synchronize

### Fixed

- (public) fixed 60-second slave delay on wallclock-triggered priority transitions
- (public) fixed false priority-change detection during SMIL playlist updates
- (public) fixed slave infinite resync loop with playMode=one playlists
- (public) fixed sync index wraparound causing unreachable resync targets
- (public) fixed stale sync messages from previous cycles causing false resyncs
- (public) fixed race conditions in master/slave sync coordination
- (public) fixed last-modified rollback detection to avoid false re-downloads when content is rolled back
- (public) fixed file type lookup not matching correctly due to leading slash
- (public) fixed a crash ("object is not iterable") when a playlist element fell back to the default duration
- (public) fixed a startup crash on Chrome 38 devices caused by unguarded `URLSearchParams`

## [3.2.10] - 2026-02-18

### Added

- (public) add per-element `reportMode` attribute for batch reporting — elements with `reportMode="batch"` save reports to
  offline CSV storage instead of HTTP POST

### Fixed

- (public) fixed batch report files being uploaded before reaching the configured report file limit
- (public) fixed hardcoded report file limit constant instead of using parsed configuration value

## [3.2.9] - 2026-01-21

### Added

- (public) landscape and portrait backup image support with automatic orientation detection

### Fixed

- (public) fixed playlist update, cancel lower version playlist instead of waiting for lower playlist element to finish
- (public) fixed playing cached playlist when device starts offline

## [3.2.8] - 2025-12-03

### Fixed

- (public) fixed offline report files exceeding 100 report limit after device restart
- (public) fixed priority coordination issues causing content overlap during playlist updates

## [3.2.7] - 2025-09-26

### Added

- (public) `updateMechanism` meta attribute with `location` strategy — check for media updates using the Location
  header/redirect URL instead of Last-Modified
- (public) `skipContentOnHttpStatus` and `updateContentOnHttpStatus` meta attributes to skip or force-update content based on
  HTTP status codes
- (public) `contentRefresh` and `smilFileRefresh` meta attributes for separate SMIL file and media content refresh intervals
- (public) per-element update attributes: `updateCheckUrl`, `updateCheckInterval`, `allowLocalFallback`
- (public) `useInReportUrl` per-element attribute to control which URL appears in reports
- (public) `fallbackToPreviousPlaylist` meta attribute to continue playing previous valid playlist when a new SMIL file is
  invalid or empty
- (public) `debugEnabled` applet configuration option
- (public) support for multiple logging types simultaneously (e.g., `type="manual,standard"`)

### Fixed

- (public) fixed widget triggers not working correctly
- (public) fixed SMIL file refresh interval not being applied separately from content refresh
- (public) fixed AbortController compatibility for older devices

## [3.2.6] - 2025-03-26

### Added

- (public) `timeOut` meta attribute for configurable HEAD request timeout (default 2000ms)
- (public) dynamic sync engine selection based on `syncServerUrl`
- (public) parallel file downloads instead of sequential

### Fixed

- (public) fixed handling of trigger sync groups when the playlist contains no sync
- (public) improved file check performance

## [3.2.4] - 2025-04-01

### Fixed

- (public) fix offline reporting bug when device goes repeatedly offline and online

## [3.2.3] - 2024-13-12

### Added

- (public) documentation for new features

### Fixed

- (public) few outdated parts in documentation
- (public) fix wallclock issue with combination of weekday and daily repeat attributes

## [3.2.2] - 2024-15-11

### Changed

- (public) increase interval for sending event reports to 10 minutes

## [3.2.1] - 2024-15-11

### Fixed

- (public) make sending event reports async to avoid blocking playback

## [3.2.0] - 2024-08-10

### Added

- (public) added ISO timestamp to PoP event reports
- (public) added option to specify custom endpoint in smil file header to send PoP event reports to

## [3.1.3] - 2024-29-09

### Changed

- (public) change intro media display process to display intro as soon as possible to avoid black screen during smil player
  startup

### Fixed

- (public) fixed issue with billboard transitions positioning not properly reflecting regions coordinates

## [3.1.2] - 2024-29-09

### Added

- (public) add a timeout for priority sync to avoid rare case when playlist freezes

### Fixed

- (public) fixed issue with default transition and priority content not working properly

## [3.1.0] - 2024-29-09

### Added

- (public) added proof of play (PoP) support
- (public) added multiple sync group for synchronization before sync content plays and after sync content finishes for smoother
  sync transitions
- (public) added billboard transitions support for images
- (public) added option to specify default transition in smil file header ( default transition is used for all images in playlist
  unless different transition is specified)

## [3.0.0] - 2024-24-07

### Changed

- (public) sync index for the content is now computed for the whole regions instead of separate parts of playlist (seq, par tags
- (public) removed __smil_version query string from widgets displaying websites

### Added

- (public) support for dynamic triggers
- (public) upgrade to node v20
- (public) improved performance for older devices
- (public) improve video playback performance
- (public) improved reporting messages
- (public) ability to restart applet when sync service fails
- (public) ability to monitor synchronization with event reports
- (public) added option to start triggers from inside the widget
- (public) event reports now reporting if media is being synchronized with playback on other devices
- (public) upgrade tools like typescript webpack to newer versions
- (public) added random playback support with ability to shuffle content or randomly select content from the playlist
- (public) improve priority types stop and defer performance
- (public) added option to specify default repeat count in smil file header ( default repeat count is used everywhere where
  repeat count
  is not specified )

### Fixed

- (public) bug with conditional expression date and time comparison
- (public) fixed rare occurrence of top priority content flickering when returning to lower priority
- (public) fixed issues with seamless update and top priority content
- (public) fixed prepare of dynamic content on slave playlist devices to ensure gapLess playback
- (public) fixed issue with parent overriding child content in priority playback
- (public) fixed body css bug during smil player start
- (public) fixed issue with wallClock notation when no repeatCount is specified
- (public) fixed issue when priority content specified with wallClock not starting properly
- (public) fixed parent generation bug for dynamic and priority segments
- (public) fixed issues with seamless update and sync content
- (public) fixed rewinding sync content to find the correct one to play with priority defined
- (public) fixed issue with trigger parent window listeners on android devices

## [2.1.0] - 2024-01-15

### Fixed

- (public) fix rare bug which occurs in widget optimization during smil playlist update
- (public) clarification that advanced usage with extra configuration is still in development

### Added

- (public) added option to stop trigger using same triggerId as to invoke it
- (public) change failOver mechanism so all devices take care of broken device
- (public) added ticker implementation
- (public) added markdown documentation for the smil playlist creation and syntax

## [2.0.0] - 2022-05-31

### Fixed

- (public) fixed wallClock and repeatCount=indefinite edge case bug
- (public) fixed background video single loop freeze
- (public) fixed repeatCount issues when combined with priorityClasses and wallClock notations
- (public) fixed relative src path for triggers
- (public) fixed rare bug with multiple triggers using same region not working correctly
- (public) fixed bug with keyboard triggers with specified duration
- (public) fixed transitions with underlying content
- (public) fixed issue when trying to prepare video which no longer exists in localstorage
- (public) fixed rare bug with one widget in playlist not visible after smil update

### Changed

- (public) multiple components code refactor

### Added

- (public) improved seamless update performance
- (public) improved general playback performance
- (public) improved multiple widgets in playlist performance
- (public) added option to turn off preloading of widgets ( widget is loaded at exact time when it should start playing, not
  before)
- (public) added transitions support for widgets
- (public) added support for applet-synchronizer
- (public) added option to synchronize playback among multiple devices in same sync group
- (public) added support for synchronization failOver content ( when one device withing sync group goes offline, other one
  takes care of its playback )
- (public) added new home screen
- (public) added new default backup image
- (public) added option to specify z-index on img or ref tags in smil xml file

### Removed

- (public) removed input form from home screen

## [1.9.1] - 2022-02-15

### Fixed

- (public) added config definition allowing to show required configuration in Box
- (public) added optional z-index attribute to img and ref tag in smil file
- (public) added conditional expression to smil data refresh configuration
- (public) fixed race condition with seamless update
- (public) fixed conditional timeFormat issue
- (public) fixed right and bottom css positioning for regular media and triggers

## [1.9.0] - 2021-10-14

### Fixed

- (public) fixed bug with video playback in background not working properly
- (public) fixed rare bug with malformed files in internal storage
- (public) fixed rare bug with wallClock definitions
- (public) fixed rare bug with wallClock endTime

### Added

- (public) Add bottom option to element positioning
- (public) Add video streaming support

## [1.8.0] - 2021-09-14

### Fixed

- (public) Query parameters of HTML widgets for Brightsign devices
- (public) fixed image transitions bug

### Added

- (public) Add seamless update support

## [1.7.0] - 2021-06-30

### Fixed

- (public) fix bug with non-existing videos failing smil file parse
- (public) fix issue when smil player was stuck on backup image after xml parse failure

### Added

- (public) add option to turn off media update ( set interval as -1)

## [1.6.1] - 2021-06-07

### Fixed

- (public) fix bug with single priorityClass not working properly
- (public) fix rare bug with playing blank image ( no source )

## [1.6.0] - 2021-05-27

### Fixed

- (public) fix bug with default region not having proper name
- (public) fix bug with wrong repeatCount for triggers
- (public) fix bug with parent generation hashing algorithm
- (public) improved intro handling
- (public) improved playlist sanitization
- (public) improve media url validation
- (public) improved conditional expressions handling

### Added

- (public) added smil event reporting support
- (public) added onClick/onTouch triggers with duration specified in seconds
- (public) added support for image to image crossFade transition
- (public) added optional `serialPortDevice` in sos.config to dynamically define device address for serial communication
- (public) added support for fixed video duration
- (public) added support for widgets with query parameters
- (public) added support for auth headers for media download
- (public) added ICS format implementation for conditional expression
- (public) added support for smil files with no active content
- (public) added support for backup image if smil-player fails on smil file download or smil xml parse functionality supports
  image stored directly in smil repo or on remote server.

## [1.5.0] - 2021-04-14

### Fixed

- (public) bug with new parent generated during each iteration of playlist
- (public) bug with one item playlist inside priorityClass

### Added

- (public) improved smil stability
- (public) added logic to remove infinite loops and unnecessary elements
- (public) improve readme and documentation

## [1.4.0] - 2021-03-31

### Fixed

- (public) bug with multiple widgets ids in same region
- (public) bug with widgets extension remaining in code for later media
- (public) multiple components code refactor

### Added

- (public) keyboard support for triggers
- (public) ability to play triggers based on repeatCount attribute
- (public) improved image/widget performance
- (public) improved xml parsing and playlist generation

## [1.3.0] - 2021-03-12

### Fixed

- (public) fixed wrong order when processing sequences of elements without seq or par tags
- (public) improved performance during conditional playback
- (public) fixed cypress tests timeouts

### Added

- (public) added local express server for cypress tests
- (public) added dynamic cypress tests for priority and wallclock

## [1.2.0] - 2021-02-12

### Added

- (public) basic cypress tests support
- (public) advanced conditional expression conditions

### Fixed

- (public) fixed bug with file update blocked by wallClock functions
- (public) fixed bug with one playlist blocking another during wait
- (public) improved performance for LG devices

## [1.1.0] - 2021-01-26

### Added

- (public) trigger support
- (public) webos video playback hotfix with sleep(videoDuration) and Promise.race
- (public) add priority behaviour support (excl and priorityClass tags)
- (public) add conditional playback support
- (public) add improved error handling
- (public) add new instance of playlist during each smil restart
- (public) add lastModified check during media files download at the start of the smil processing
- (public) add check for empty localFilePath during video playback

### Fixed

- (public) fixed smil parsing issue on Rpi
- (public) fixed new smil file download/offline processing
- (public) fixed media files update check
- (public) fixed image intro
- (public) fixed image/widgets update check, add random query string to avoid caching except for brightsign device
- (public) remove navigator.online and replace it with fetch functionality
- (public) fixed edge case bug causing infinite loop when no playlist is active
- (public) fixed wallClock bug for different dates without repeat

## [1.0.1] - 2020-09-17

### Added

- (public) performance optimization for older devices
- (public) add JSDoc, code structure improvements
- (public) improve test coverage

### Fixed

- (public) fix offline playback
- (public) performance improvements for older/slower devices

## [1.0.0] - 2020-08-31

### Added

- (public) First released version, supported features in readme or https://docs.signageos.io/category/smil-guides

## [0.0.1] - 2020-03-01

### Added

- (public) Initial PoC release of SMIL player
