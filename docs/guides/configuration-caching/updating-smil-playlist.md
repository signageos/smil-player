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

- `content` - defines the check interval in seconds; mandatory.
- `expr` - limits the check interval based on [expression](https://docs.signageos.io/hc/en-us/articles/4405241217810);
  optional.
- `onlySmilUpdate` - when set to true, the player only checks the actual SMIL file for updates and not the media
  specified within the SMIL file.

By using `expr`, you can limit the time when the signageOS SMIL Player checks for an update during a selected time
period, e.g., from 1 am to 6 am:

`expr="compare(time(),'01:00:00')>0 and compare(time(), '6:00:00')<0"`

> ### Important: HEAD requests
>The SMIL player makes a `HEAD` request to check `Last-modified` instead of using GET/POST. This method saves bandwidth.
>
> If you encounter CORS issues, ensure that your CDN/storage supports CORS for `HEAD` requests as well.

If the `Refresh` information is missing, a default value of (`20` seconds) is used.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
