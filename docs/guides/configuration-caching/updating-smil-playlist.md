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

- `content` - defines the check interval in seconds; mandatory.
- `expr` - limits the check interval based on [expression](https://docs.signageos.io/hc/en-us/articles/4405241217810);
  optional.
- `timeOut` - sets the timeout for HEAD requests in milliseconds (default: 2000ms); optional. Useful for slower or unstable networks where you may want to increase the timeout (e.g., 5000-10000ms).
- `onlySmilUpdate` - when set to true, the player only checks the actual SMIL file for updates and not the media
  specified within the SMIL file.

By using `expr`, you can limit the time when the signageOS SMIL Player checks for an update during a selected time
period, e.g., from 1 am to 6 am:

`expr="compare(time(),'01:00:00')>0 and compare(time(), '6:00:00')<0"`

### Examples with Different Configurations

```xml
<!-- Fast network with frequent updates -->
<meta http-equiv="Refresh" content="30" timeOut="2000"/>

<!-- Slower network with longer timeout -->
<meta http-equiv="Refresh" content="60" timeOut="5000"/>

<!-- Unstable network with extended timeout and less frequent checks -->
<meta http-equiv="Refresh" content="120" timeOut="10000" onlySmilUpdate="true"/>
```

> ### Important: HEAD requests
>The SMIL player makes a `HEAD` request to check `Last-modified` instead of using GET/POST. This method saves bandwidth.
>
> If you encounter CORS issues, ensure that your CDN/storage supports CORS for `HEAD` requests as well.

If the `Refresh` information is missing, a default value of (`20` seconds) is used.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
