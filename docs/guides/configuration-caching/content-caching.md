# Backup Image

signageOS SMIL Player automatically cache SMIL file, all media and widgets into the internal memory of the device to allow playback in case there is no network connection.

## How are media handled after a device reboot? Are they re-downloaded?

The content is stored in persistent storage on the device. The SMIL Player downloads files only once (in the first SMIL file load), then all media files and widgets are stored and available even after the device reboot.

## What happens if some content is not played anymore (SMIL changed)? Is it deleted from disk immediately?

If any media files or widgets are no longer needed they are deleted once:

- the SMIL Player reboots
- the SMIL file changes
- a new SMIL file is added
- the current SMIL file gets some media/content updated

## Is there an automatic file/cache-cleanup implemented in the device?

Any changes implemented in the SMIL file or when the new content is added, all files which are no longer needed are removed.

## How to turn off smil player update mechanism?

If you want to turn off head requests which monitor if some media files was updated, you can specify in your smil file `onlySmilUpdate` attribute in refresh `<meta>` tag in smil header.

```xml
<meta http-equiv="Refresh" content="10" onlySmilUpdate="true"/>
```
This xml above means, that SMIL player will check for updates only original smil file and not all media which are specified within the smil file. Smil player will check for smil file changes each 10 seconds.

If `onlySmilUpdate` is missing, default value is false, which means Smil player will check smil file and all media withing for updates each 10 seconds.

## `<prefetch>` (legacy caching method)

>The section below is to maintain compatibility with the legacy SMIL systems.

>**signageOS SMIL Player automatically caches** all files in the SMIL playlist in the internal memory and deletes old files which are no longer in need. You do not have to define them in the `prefetch` tag.

Media files used in SMIL are loaded "on-the-fly" as they are used for the first time. After they are played once, they are kept in the cache storage. Unless storage runs out, media files are played from the cache storage when they are played subsequently.

## Prefetching a file

The following SMIL code segment loads "movie.mpg" into the cache without playing it.

```xml
<prefetch src="http://server/movie.mpg" />
<prefetch src="movie.mpg" />
```

Usually it is used while media is played in foreground. See sample code in the section below.

>Relative paths has to **start with the folder or file name**. If you want to use relative paths to the SMIL playlist location - e.g.: `<prefetch src="movie.mpg" />`, never start the URL with `.` or `/`. That would be an invalid path. >

## Example

```xml
<!-- Paralel playback sequence, all below is happening at the same time -->
<par>

    <!-- Preloader to show something before the full content is loaded and ready -->
    <!-- This <seq> will happen first followed by the next seq -->
    <seq end="__prefetchEnd.endEvent">
      <seq repeatCount="indefinite">
        <!-- Play waiting prompt -->
        <video src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/loader.mp4" />
      </seq>
    </seq>

    <!-- Downloading resources into the internal storage -->
    <seq>
      <prefetch src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_1.mp4" />
      <prefetch src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/video_2.mp4" />
      <prefetch src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/img_1.jpg" />
      <prefetch src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/img_2.jpg" />
      <prefetch src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/zones/files/widget_image_1.png" />
      <prefetch src="files/bottomWidget.wgt" />

      <seq id="__prefetchEnd" dur="1s" />
    </seq>

    <!-- Once all ready, the playback of the full content will start -->
    <par begin="__prefetchEnd.endEvent" repeatCount="indefinite">
    ....
```

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
