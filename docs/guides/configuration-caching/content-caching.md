# Backup Image

signageOS SMIL Player automatically caches SMIL files, all media, and widgets into the internal memory of the device to
allow playback in case there is no network connection.

## How are media handled after a device reboot? Are they re-downloaded?

The content is stored in persistent storage on the device. The SMIL Player downloads files only once (in the first SMIL
file load), then all media files and widgets are stored and available even after the device reboot.

## What happens if some content is not played anymore (SMIL changed)? Is it deleted from disk immediately?

If any media files or widgets are no longer needed they are deleted once:

- the SMIL Player reboots
- the SMIL file changes
- a new SMIL file is added
- the current SMIL file gets some media/content updated

## Is there an automatic file/cache-cleanup implemented in the device?

Any changes implemented in the SMIL file or when the new content is added, all files which are no longer needed are
removed.

## How to turn off smil player update mechanism?

If you want to turn off head requests which monitor if some media files was updated, you can specify in your smil file
`onlySmilUpdate` attribute in refresh `<meta>` tag in smil header.

```xml

<meta http-equiv="Refresh" content="10" onlySmilUpdate="true"/>
```

This xml above means, that SMIL player will check for updates only original smil file and not all media which are
specified within the smil file. Smil player will check for smil file changes each 10 seconds.

If `onlySmilUpdate` is missing, the default value is false, which means the SMIL player will check the SMIL file and all
media
within it for updates every 10 seconds.

## Configuring Update Check Timeout

You can configure the timeout for HEAD requests that check for file updates using the `timeOut` attribute:

```xml
<meta http-equiv="Refresh" content="60" timeOut="5000" onlySmilUpdate="false"/>
```

- `timeOut` - Timeout in milliseconds for HEAD requests (default: 2000ms)
- This timeout applies to all update checks (SMIL file and media files)
- For slower or unstable networks, consider increasing the timeout to 5000-10000ms
- The timeout prevents the player from waiting too long when checking for updates on slow connections

## Handling Unavailable Content

The SMIL Player can automatically skip content that returns HTTP error codes, ensuring uninterrupted playback even when some media files are unavailable.

### Automatic Content Skipping

Configure the player to skip content based on HTTP status codes:

```xml
<meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="404"/>
```

With this configuration:
- When a media file returns HTTP 404 (Not Found), it will be automatically skipped
- The playlist continues with the next available content
- No black screens or playback interruption occurs

### Multiple Status Codes

You can specify multiple HTTP status codes to handle various error scenarios:

```xml
<meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="403,404,500,503"/>
```

Common status codes to consider:
- **404** - Not Found: Content doesn't exist on the server
- **403** - Forbidden: Access denied to the content
- **500** - Internal Server Error: Server-side error
- **503** - Service Unavailable: Temporary server unavailability

This feature is particularly useful for:
- Dynamic content feeds that may have temporary gaps
- Playlists with external content sources
- Preventing playback disruption in production environments

## URLs with Query Parameters

The SMIL Player treats URLs with different query parameters as separate files for caching purposes. This means that each unique combination of URL and query parameters will be cached independently.

### How it works

When the SMIL Player encounters URLs with query parameters, it includes those parameters in the cache file naming. This ensures that:
- Different content variations can be served using the same base URL
- Each variation is cached separately
- Query parameters can be used for tracking, versioning, or dynamic content selection

### Important Note on XML Encoding

When using query parameters in SMIL files, remember to properly XML-encode the ampersand character:
- Use `&amp;` instead of `&` between query parameters

### Example Usage

```xml
<!-- These URLs will be cached as separate files -->
<video src="https://example.com/content?adunit=ABC123&amp;id=1" region="main"></video>
<video src="https://example.com/content?adunit=ABC123&amp;id=2" region="main"></video>

<!-- Using query parameters for versioning -->
<img src="https://example.com/banner.jpg?version=2.1&amp;campaign=summer" dur="5s" region="main"></img>

<!-- Dynamic content based on parameters -->
<ref src="https://example.com/widget?location=NYC&amp;lang=en" type="text/html" dur="10s" region="main"></ref>
```

### Common Use Cases

1. **Content Variations**: Serve different content using the same base URL with different parameters
2. **Analytics Tracking**: Add tracking parameters to monitor content performance
3. **A/B Testing**: Use parameters to serve different versions for testing
4. **Dynamic Content**: Pass contextual information through query parameters

## `<prefetch>` (legacy caching method)

> The section below is to maintain compatibility with the legacy SMIL systems.

> **signageOS SMIL Player automatically caches** all files in the SMIL playlist in the internal memory and deletes old
> files which are no longer in need. You do not have to define them in the `prefetch` tag.

Media files used in SMIL are loaded "on-the-fly" as they are used for the first time. After they have been played once,
they
are kept in the cache storage. Unless storage runs out, media files are played from the cache storage when they are
played subsequently.

## Prefetching a file

The following SMIL code segment loads "movie.mpg" into the cache without playing it.

```xml

<prefetch src="http://server/movie.mpg"/>
<prefetch src="movie.mpg"/>
```

Usually it is used while media is played in foreground. See sample code in the section below.

> Relative paths have to **start with the folder or file name**. If you want to use relative paths to the SMIL playlist
> location - e.g.: `<prefetch src="movie.mpg" />`, never start the URL with `.` or `/`. That would be an invalid path. >

## Example

```xml
<!-- Parallel playback sequence, all below is happening at the same time -->
<par>

    <!-- Preloader to show something before the full content is loaded and ready -->
    <!-- This <seq> will happen first, followed by the next <seq> -->
    <seq>
        <seq repeatCount="indefinite">
            <!-- Play waiting prompt -->
            <!-- Play waiting prompt animation -->
        </seq>
    </seq>

    <!-- Download resources into the internal storage -->
    <seq>
        <prefetch src="https://demo.signageos.io/smil/zones/files/video_1.mp4"/>
        <prefetch src="https://demo.signageos.io/smil/zones/files/video_2.mp4"/>
        <prefetch src="https://demo.signageos.io/smil/zones/files/img_1.jpg"/>
        <prefetch src="https://demo.signageos.io/smil/zones/files/img_2.jpg"/>
        <prefetch src="https://demo.signageos.io/smil/zones/files/widget_image_1.png"/>
        <prefetch src="files/bottomWidget.wgt"/> <!-- Use proper path structure -->
    </seq>

    <!-- Once all preloads are ready, the playback of the full content will start -->
    <par repeatCount="indefinite">
        ....
```

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
