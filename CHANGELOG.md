# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- basic cypress tests support

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
