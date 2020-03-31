# SMIL player PoC

- This solution is alpha version of signageOs SMIL player applet.

## Necessary attributes in SMIL file
- region name has to be specified in one of there two ways
```
<region regionName="widget12"..../>
<region xml:id="widget12" .... />
```
- accepts only url to SMIL file ( form input at main page ), local storage is not supported
- all files ( audio, video.. ) must be stored on remote server,  local storage is not supported

## Supported features
- sequential and parallel play of audio, video, image and widget
- supports simple layering with videos always played on background ( lowest level ) 
- pairs all media with proper regions from layout part of SMIL, you no region specified, uses values from root-layout tag
- plays media in endless loops if necessary ( one element as well as multiple )
- supports prefetch event ( plays intro while downloading rest of the files )
- downloads all necessary files from remote server, stores files in local storage
- downloads and extracts of widgets into local storage
- checks for changes in provided SMIL file as well as checks for all files linked in SMIL
- ability to restart on SMIL file change

## NOT supported features
- priority playlist, timings
- not able to process files stored in local storage

### Used technology
- webpack, typescript, mocha
