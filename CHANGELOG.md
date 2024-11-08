# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to
[Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

DOPLNIT CHANGELOG

### Added

- support for dynamic triggers
- upgrade to node v20
- improved performance for older devices
- improve video playback performance
- improved reporting messages
- added option to start triggers from inside the widget

### Fixed

- bug with conditional expression date and time comparison

## [2.1.0] - 2024-01-15

### Fixed

- fix rare bug which occurs in widget optimization during smil playlist update
- clarification that advanced usage with extra configuration is still in development

### Added

- added option to stop trigger using same triggerId as to invoke it
- change failover mechanism so all devices take care of broken device
- added ticker implementation
- added markdown documentation for the smil playlist creation and syntax

## [2.0.0] - 2022-05-31

### Fixed

- fixed wallclock and repeatCount=indefinite edge case bug
- fixed background video single loop freeze
- fixed repeatCount issues when combined with priorityClasses and wallclock notations
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
- added support for synchronization failover content ( when one device withing sync group goes offline, other one
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
- fixed rare bug with wallclock endTime

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
- added support for image to image crossfade transition
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

- fixed bug with file update blocked by wallclock functions
- fixed bug with one playlist blocking another during wait
- improved performance for LG devices

## [1.1.0] - 2021-01-26

### Added

- trigger support
- webos video playback hotfix with sleep(videoDuration) and Promise.race
- add priority behaviour support (excl and priorityClass tags)
- add conditional playback support

### Fixed

- fixed smil parsing issue on Rpi
- fixed new smil file download/offline processing
- fixed media files update check
- fixed image intro
- fixed image/widgets update check, add random query string to avoid caching except for brightsign device
- add improved error handling
- add new instance of playlist during each smil restart
- add lastModified check during media files download at the start of the smil processing
- add check for empty localFilePath during video playback
- remove navigator.online and replace it with fetch functionality
- fixed edge case bug causing infinite loop when no playlist is active
- fixed wallclock bug for different dates without repeat

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
