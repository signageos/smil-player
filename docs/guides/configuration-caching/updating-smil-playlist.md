# Updating SMIL playlist - PULL mode

## Updating the Players

To supply fresh content to a player, one must specify the `Refresh` meta attribute in the first SMIL playlist loaded
from the server. The syntax is as follows:

```xml

<smil>
    <head>
        <!-- How often to refresh the SMIL, values in SECONDS with optional expression -->
        <meta http-equiv="Refresh" content="60" expr="adapi-weekday()=4" onlySmilUpdate="true"/>
    </head>
    <!-- Additional elements here -->

</smil>
```

The SMIL player reaches the SMIL playlist URL and checks the Last-modified header. Once a new version of the playlist is
uploaded, it is recognized, downloaded, and played.

### Refresh attributes

- `content` - defines the check interval in seconds for both SMIL file and media content; mandatory.
- `contentRefresh` - separate refresh interval in seconds for media content only. When set, media files are checked at
  this interval instead of the `content` value.
- `smilFileRefresh` - separate refresh interval in seconds for the SMIL file itself. When set, the SMIL file is checked
  at this interval instead of the `content` value.
- `expr` - limits the check interval based on [expression](https://docs.signageos.io/hc/en-us/articles/4405241217810);
  optional.
- `onlySmilUpdate` - when set to true, the player only checks the actual SMIL file for updates and not the media
  specified within the SMIL file.
- `fallbackToPreviousPlaylist` - when set to `true`, the player continues playing the previous valid playlist if a newly
  downloaded SMIL file is invalid or contains an empty playlist. Prevents a broken upload from taking down playback.
- `timeOut` - timeout in milliseconds for HEAD requests used to check for updates. Defaults to `2000` (2 seconds).
  Increase this value if your server or CDN is slow to respond to HEAD requests.

> ### Split refresh intervals
> If both `content` and `contentRefresh`/`smilFileRefresh` are set, the split values take precedence. For example,
> setting `content="60" contentRefresh="120" smilFileRefresh="30"` will check media every 120 seconds and the SMIL file
> every 30 seconds, ignoring the `content` value for both.

#### Example with split intervals and fallback

```xml
<smil>
    <head>
        <meta http-equiv="Refresh"
              content="60"
              contentRefresh="120"
              smilFileRefresh="30"
              fallbackToPreviousPlaylist="true"/>
    </head>
    <!-- Additional elements here -->
</smil>
```

By using `expr`, you can limit the time when the signageOS SMIL Player checks for an update during a selected time
period, e.g., from 1 am to 6 am:

`expr="compare(time(),'01:00:00')>0 and compare(time(), '6:00:00')<0"`

> ### Important: HEAD requests
>The SMIL player makes a `HEAD` request to check `Last-modified` instead of using GET/POST. This method saves bandwidth.
>
> If you encounter CORS issues, ensure that your CDN/storage supports CORS for `HEAD` requests as well.

If the `Refresh` information is missing, a default value of (`20` seconds) is used.

## See also

- [Check Before Play](check-before-play.md) — check each media file for updates right before playback instead of polling
- [Media Update Configuration](media-update-configuration.md) — per-element update attributes, update mechanisms, and status-code handling

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
