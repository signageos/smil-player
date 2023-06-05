# Updating SMIL playlist - PULL mode

## Updating the Players

To supply fresh content to a player, one needs to specify `Refresh` meta attribute in the first SMIL playlist loaded from the server. The syntax is as follows:

```xml
<smil>
  <head>
    <!-- How often to refresh the SMIL, values in SECONDS with optional expression -->
    <meta http-equiv="Refresh" content="60" expr="adapi-weekday()=4" onlySmilUpdate="true"/>
  </head>
  ...

</smil>
```

SMIL player is reaching the SMIL playlist URL and checking Last-modified header. Once you upload a new version of the playlist, it's recognized, downloaded, and played.

- `content` - defines the check interval in seconds, mandatory
- `expr` - limit the check interval based on [expression](https://docs.signageos.io/hc/en-us/articles/4405241217810), optional
- `onlySmilUpdate` - with this options set to true, player will only check actual smil file for updates and not media specified within smil file

By using `expr` you can limit the time when signageOS SMIL Player checks for an update during selected time period, e.g. from 1am to 6am:

`expr="compare(time(),'01:00:00')>0 and compare(time(), '6:00:00')<0"`

>### Important: HEAD requests
>SMIL player is doing `HEAD` request for checking `Last-modified` instead of GET/POST. The reason is to save bandwidth.
>
> If you are running into CORS issues, check that your CDN/storage have CORS set for `HEAD` requests as well.

If `Refresh` information is missing, default value (`20` seconds) is used.

Source: [a-smil.org](https://www.a-smil.org/index.php/Main_Page)
