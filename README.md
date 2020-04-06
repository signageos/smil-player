# SMIL player PoC

- This solution is alpha version of signageOs SMIL player applet.


## SMIL mandatory structure
```xml
<smil>
    <head>
        <layout>
            <root-layout width="1080" height="1920" backgroundColor="#FFFFFF" />
            <region regionName="video" left="0" top="0" width="1080" height="1920" z-index="1" backgroundColor="#FFFFFF" mediaAlign="center" />
        </layout>
    </head>
    <body>
        <par> 
            Whole playlist goes here
        </par> 
    </body>
</smil>
```
## Supported SMIL  playlist tags
- par and seq are fully supported
- priorityClass and excl are treated as seq tags in this PoC version

## Necessary attributes in SMIL file
- region name has to be specified in one of these two ways
```
<region regionName="widget12"..../>
<region xml:id="widget12" .... />
```
- accepts only url to SMIL file ( form input at main page ), local storage is not supported
- all files ( audio, video.. ) must be stored on remote server,  local storage is not supported

## Supported features
- sequential and parallel play of audio, video, image and widget
- supports simple layering ( z-index ) with videos always played on background ( lowest level ) 
- pairs all media with proper regions from layout part of SMIL, if no region specified, uses values from root-layout tag
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
