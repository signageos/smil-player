# signageOS SMIL player

This is source code for signageOS SMIL player applet, which takes smil file as input, parses it to json structure and
then plays the playlist using signageOS SDK functions on a device in a browser.

## Project structure

### config

Application config file, used for env_vars and sos package configuration ( video play mode )

### public/index.html

Entry web page of the applet. The SMIL file URL is provided via the `smilUrl` applet configuration (there is no input
form).

### src/index.ts

The main file of SMIL player, is responsible for getting input either from html form from public/index.html or from
smilUrl which is passed using SoS timings. Also, it sets up internal storage, where SMIL player saves all files, and it
composes together rest of functions exposed by playlist of by files, so they cooperate together correctly.

### src/components/files

Component responsible for handling operations with files listed below: \

- download
- update
- delete
- extract archives
- create folder structure in storage unit

Sub-folders: **fetchingStrategies/** (pluggable update-check strategies — Last-Modified and Location header),
**resourceChecker/** (interval-based update polling), and **tools/** with helper functions such as getting file name
of path out of url.

### src/components/playlist

Component responsible for recursively processing playlist in json format and playing all types of media. For actual
playing of media it uses mostly SoS sdk functions which you can find more about here
https://developers.signageos.io/sdk.

It contains function which is processing SMIL playlist in an infinite loop, as well as checking if smil file or any
other media changed. If so, it will stop infinite playlist processing and restart whole process with freshly updated
data.

Sub-components:

- **playlistProcessor/** — the core playback engine: the main processing loop, the recursive playlist traverser, and
  the per-element controller (play/pause/visibility, sync coordination)
- **playlistDataPrepare/** — pre-processes the parsed SMIL into internal structures (regions, transitions, media info)
- **playlistPriority/** — priority (`excl`/`priorityClass`) decision engine and conflict resolution
- **playlistTriggers/** — keyboard/mouse/widget/sensor trigger handling and dynamic playlists
- **playlistCommon/** — base class with shared playlist utilities
- **tools/** — helper functions for playlist processing (wallclock/repeatCount scheduling, conditional expressions,
  sync tools, html rendering tools, ticker tools, etc.)

### src/components/xmlParser

Component responsible for parsing smil file in xml to json object, which has all information for playing smil \
it uses **xml2js** npm module for xml -> json conversion. Examples how exactly looks conversion from smil to json can be
found in SMIL folder, where are files in SMIL format and their json counterparts.

Tools folder contains helper functions.

Mock folder contains SMIL files which are used in tests as mocks for testing correct behaviour of xmlParser component.

### src/enums

Constants and enums such as filepath or default wallclock values

### src/models

Typescript types and definitions used in application

### SMIL/

Folder with example SMIL files and its parsed versions in json. Json version is used further in application to download
media, process playlist etc...

### test/

Folder contains simple unit tests to test supporting functions. Tests are written with Mocha framework using chai for
asserts. Unit tests are using mocks in JSON or SMIL format which are stored is same folders as tested functionality.
Complex tests for front-end part of application and media playing are missing for now.

## How to develop

1. First you need to create signageOS account at https://www.signageos.io/
2. With account, you can access detailed documentation here
   https://docs.signageos.io/hc/en-us/articles/4405070294674-Hello-World-Setup-Developer-Environment
3. How to run this project:
    1. install node modules => **npm install**
    2. build application => **npm run build**, this will create dist folder with compiled source code
    3. run application => **npm start**
    4. steps above should complete without any error, your application is running on **http://your.pc.ip.address:8090**

For applet configuration options (`smilUrl`, `videoBackground`, sync settings, etc.), see the
[Applet Configuration Reference](docs/reference/applet-config.md). For enabling debug logs, see
[Debugging](docs/getting-started/debugging.md). For a production build run **npm run build-prod**; test commands
are listed in the Common Commands section of [CLAUDE.md](CLAUDE.md).

## Tools used

- @signageos/front-applet
- @signageos/front-display
- @signageos/cli https://docs.signageos.io/hc/en-us/articles/4405111438354
- webpack https://webpack.js.org/
- tslint
- debug
- Istanbul test coverage, reports https://istanbul.js.org/
- lodash

## Useful links

[Hello world](https://docs.signageos.io/hc/en-us/articles/4405240988178-Hello-World-SMIL-Playlist)\
[Basics of SMIL](https://docs.signageos.io/hc/en-us/sections/4405646921746-Basics-of-SMIL-Player)\
[signageOS JS SDK](https://sdk.docs.signageos.io)
