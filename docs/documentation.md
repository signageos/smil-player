# SignageOs SMIL player

This is source code for SignageOs SMIL player applet, which takes smil file as input, parses it to json structure
and then plays the playlist using signageOs sdk functions on a device in a browser.

## Project structure

### config
Application config file, used for env_vars and sos package configuration ( video play mode )

### public/index.html
Simple web page with input form. Insert url to SMIL file to process.

### src/index.ts
The main file of SMIL player, is responsible for getting input either from html form from public/index.html
or from smilUrl which is passed using SoS timings. Also, it sets up internal storage, where SMIL player
saves all files, and it composes together rest of functions exposed by playlist of by files, so they cooperate together correctly.

### src/components/files
Component responsible for handling operations with files listed below: \
- download
- update
- delete
- extract archives
- create folder structure in storage unit

Tools folder contains helper functions such as getting file name of path out of url.

### src/components/playlist
Component responsible for recursively processing playlist in json format and playing all types of media. 
Contains function to play video, image, audio and widget as well as some third party web page. For actual playing of media
it uses mostly SoS sdk functions which you can find more about here https://docs.signageos.io/api/js/content/js-api-introduction. 

It contains function which is processing SMIL playlist in an infinite loop, as well as checking if smil file or any other media changed.
If so, it will stop infinite playlist processing and restart whole process with freshly updated data.

Tools folder contains helper functions for playlist processing, most importantly function for extracting and
scheduling intervals specified in wallclock strings and repeatCount strings. This function decides if content should be played
immediately or how long it should wait until content will be played ( of at all ).

Mock folder contains parsed smil files from xmlParser/mock.

### src/components/xmlParser
Component responsible for parsing smil file in xml to json object, which has all information for playing smil \
it uses __xml2js__ npm module for xml -> json conversion. Examples how exactly looks conversion from smil to json
can be found in SMIL folder, where are files in SMIL format and their json counterparts. 

Tools folder contains helper functions. 

Mock folder contains SMIL files which are used in tests as mocks for testing correct behaviour of xmlParser component.

### src/enums
Constants and enums such as filepath or default wallclock values

### src/models
Typescript types and definitions used in application

### SMIL/
Folder with example SMIL files and its parsed versions in json.
Json version is used further in application to download media, process playlist etc...

### test/
Folder contains simple unit tests to test supporting functions. Tests are written with Mocha framework using chai for
asserts. Unit tests are using mocks in JSON or SMIL format which are stored is same folders as tested functionality.
Complex tests for front-end part of application and media playing are missing for now.

## How to develop
1. First you need to create signageOs account at https://www.signageos.io/
2. With account, you can access detailed documentation here https://docs.signageos.io/knowledge-base/setup-developer-environment
3. How to run this project:
    1. install node modules => __npm install__
    2. build application => __npm run prepare__, this will create dist folder with compiled source code
    3. run application => __npm start__
    4. steps above should complete without any error, your application is running on __http://your.pc.ip.address:8090__

## Debugging
It is possible to turn on debug messages using browser dev console. Type in __localStorage.debug = '@signageos/smil-player:*'__ 
for debugging all modules, if you wish to debug specific component, replace wildcard with the name of the component
like __localStorage.debug = '@signageos/smil-player:filesModule'__. Debug objects for each component are stored in tools folder 
plus there is debug object in main file index.ts \
To turn debugging of just delete debug from localStorage: __delete localStorage.debug__

## Tools used
- @signageos/front-applet
- @signageos/front-display
- @signageos/cli https://docs.signageos.io/api
- webpack https://webpack.js.org/
- tslint
- debug
- Istanbul
    test coverage, reports
    https://istanbul.js.org/
- lodash

## Useful links
https://docs.signageos.io/category/smil-guides
https://docs.signageos.io/knowledge-base/setup-developer-environment
https://www.w3.org/TR/SMIL3/ \
http://www.a-smil.org/index.php/Main_Page \
https://docs.signageos.io/api
