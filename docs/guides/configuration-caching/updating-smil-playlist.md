# Updating SMIL playlist - PULL mode

## Updating the Players

To supply fresh content to a player, one must specify the `Refresh` meta attribute in the first SMIL playlist loaded
from the server. The syntax is as follows:

```xml

<smil>
    <head>
        <!-- How often to refresh the SMIL, values in SECONDS with optional expression and timeout -->
        <meta http-equiv="Refresh" content="60" expr="adapi-weekday()=4" timeOut="5000" onlySmilUpdate="true"/>
    </head>
    <!-- Additional elements here -->

</smil>
```

The SMIL player reaches the SMIL playlist URL and checks the Last-modified header. Once a new version of the playlist is
uploaded, it is recognized, downloaded, and played.

### Update Check Intervals

The SMIL Player supports separate update intervals for media files and the SMIL file itself:

```xml
<!-- Separate intervals for media and SMIL file checks -->
<meta http-equiv="Refresh" contentRefresh="60" smilFileRefresh="1200"/>
```

- `content` - defines the check interval for media files in seconds; for backward compatibility, if used alone, applies to media files.
- `contentRefresh` - explicitly sets the check interval for media files in seconds; use when you want separate intervals.
- `smilFileRefresh` - sets the check interval for the SMIL file in seconds (default: 86400 seconds/24 hours).
- `expr` - limits the check interval based on [expression](https://docs.signageos.io/hc/en-us/articles/4405241217810);
  optional.
- `timeOut` - sets the timeout for HEAD requests in milliseconds (default: 2000ms); optional. Useful for slower or unstable networks where you may want to increase the timeout (e.g., 5000-10000ms).
- `skipContentOnHttpStatus` - automatically skip media files that return specified HTTP error codes (e.g., "404" or "403,404,500"); optional. This prevents playback interruption when content is unavailable.
- `updateContentOnHttpStatus` - force re-download of media files that return specified HTTP status codes (e.g., "200,205"); optional. This works alongside last-modified headers as an additional update trigger mechanism.
- `fallbackToPreviousPlaylist` - when set to true, continues playing the current playlist if an invalid SMIL file is provided during an update (default: false); optional. Prevents disruption from deployment errors.
- `onlySmilUpdate` - when set to true, the player only checks the actual SMIL file for updates and not the media
  specified within the SMIL file.

By using `expr`, you can limit the time when the signageOS SMIL Player checks for an update during a selected time
period, e.g., from 1 am to 6 am:

`expr="compare(time(),'01:00:00')>0 and compare(time(), '6:00:00')<0"`

### Benefits of Separate Update Intervals

Splitting media and SMIL file checks provides several advantages:

1. **Performance Optimization**: Reduce unnecessary HEAD requests for stable SMIL files while keeping media content fresh
2. **Bandwidth Efficiency**: SMIL files typically change less frequently than media content
3. **Flexible Update Strategies**: 
   - Dynamic content (news, weather) can update frequently
   - Playlist structure can remain stable with less frequent checks
4. **Backward Compatibility**: Using only `content` attribute continues to work for media file checks

**Common Use Cases:**
- **Dynamic Content Feeds**: Check media every 30 seconds, SMIL daily
- **Stable Playlists**: Check media hourly, SMIL weekly
- **Live Events**: Frequent media updates during events, rare SMIL changes

### Examples with Different Configurations

```xml
<!-- Fast network with frequent updates (backward compatible) -->
<meta http-equiv="Refresh" content="30" timeOut="2000"/>

<!-- Separate intervals: media every minute, SMIL every 20 minutes -->
<meta http-equiv="Refresh" contentRefresh="60" smilFileRefresh="1200"/>

<!-- Frequent media updates, daily SMIL checks -->
<meta http-equiv="Refresh" contentRefresh="30" smilFileRefresh="86400"/>

<!-- Slower network with longer timeout -->
<meta http-equiv="Refresh" content="60" timeOut="5000"/>

<!-- Unstable network with extended timeout and less frequent checks -->
<meta http-equiv="Refresh" content="120" timeOut="10000" onlySmilUpdate="true"/>

<!-- Skip unavailable content (404 errors) -->
<meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="404"/>

<!-- Skip multiple error types for robust playback -->
<meta http-equiv="Refresh" content="60" skipContentOnHttpStatus="403,404,500,503"/>

<!-- Complete configuration with all options -->
<meta http-equiv="Refresh" content="60" 
      timeOut="5000" 
      skipContentOnHttpStatus="404,503" 
      onlySmilUpdate="false"
      expr="compare(time(),'01:00:00')>0 and compare(time(), '6:00:00')<0"/>
```

### Content Error Handling

When `skipContentOnHttpStatus` is configured:
- Media files returning the specified HTTP status codes are automatically skipped
- The playlist continues playing the next available content
- This prevents black screens or playback interruption when content is temporarily or permanently unavailable
- Common use cases include:
  - Dynamic content that may not always be available (404 - Not Found)
  - Access-restricted content (403 - Forbidden)
  - Server errors (500 - Internal Server Error, 503 - Service Unavailable)

### Forced Content Updates

The `updateContentOnHttpStatus` attribute provides an additional update mechanism alongside last-modified headers:

```xml
<!-- Force update when server returns specific status codes -->
<meta http-equiv="Refresh" content="60" updateContentOnHttpStatus="200,205"/>

<!-- Combine skip and update for comprehensive content management -->
<meta http-equiv="Refresh" content="60" 
      skipContentOnHttpStatus="404,503"
      updateContentOnHttpStatus="200,205"/>
```

How it works:
- When HEAD request returns a configured status code, the content is marked for re-download
- This works **in addition to** last-modified header checks
- Useful when servers use status codes to signal content updates
- The player will re-download the content even if last-modified hasn't changed

Common use cases:
- **HTTP 200**: Force refresh of dynamic content on successful response
- **HTTP 205 (Reset Content)**: Server explicitly requests content refresh
- **Custom CDN codes**: Some CDNs use specific codes to signal new versions
- **Dynamic content APIs**: Services that signal updates through status codes

This provides flexibility for servers that:
- Don't properly set last-modified headers
- Use status codes as update signals
- Need to force updates regardless of timestamps

### Fallback to Previous Playlist

The `fallbackToPreviousPlaylist` attribute provides protection against invalid SMIL updates:

```xml
<!-- Continue current playlist if invalid SMIL is provided -->
<meta http-equiv="Refresh" content="60" fallbackToPreviousPlaylist="true"/>

<!-- Combined with other options for robust operation -->
<meta http-equiv="Refresh" content="60" 
      fallbackToPreviousPlaylist="true"
      skipContentOnHttpStatus="404"
      timeOut="5000"/>
```

When enabled:
- If an invalid or broken SMIL file is deployed, the player continues with the current valid playlist
- No backup image is shown - the display continues uninterrupted
- The player keeps checking for valid updates in the background
- Once a valid SMIL is found, it will be loaded and played

This is particularly useful for:
- Production environments where display continuity is critical
- Preventing accidental deployment of broken configurations
- Maintaining playback during CMS or server issues
- Avoiding the backup image display for temporary problems

**Note:** Without this option, an invalid SMIL update would trigger the backup image display.

> ### Important: HEAD requests
>The SMIL player makes a `HEAD` request to check `Last-modified` instead of using GET/POST. This method saves bandwidth.
>
> If you encounter CORS issues, ensure that your CDN/storage supports CORS for `HEAD` requests as well.

If the `Refresh` information is missing, a default value of (`20` seconds) is used.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
