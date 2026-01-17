# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to
[Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added

- fallbackToPreviousPlaylist flag to allow playing new playlist only if it is valid, otherwise, continue playing the
  previous playlist
- add option to check for media updates using location header or url instead of last-modified header in the response
- add option to skip or update content based on the status code from response
- add allowLocalFallback option to fall back to cached content when server returns errors
- add useInReportUrl attribute for reporting correct URL of element in case of redirects
- add debugEnabled configuration option to enable debug logging based on timing config
- add option to specify multiple logging types

### Fixed

- fixed handling of trigger sync groups when the playlist contains no sync
- fixed priority coordination issues causing content overlap during playlist updates
- fixed playing cached playlist when device starts offline
- fixed offline report files exceeding 100 report limit after device restart
- fixed widget triggers not working correctly
- fixed smilFileRefresh interval timing

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
