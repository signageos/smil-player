# Conditional Playback

SMIL features the `expr` tag for defining conditions during which a media item is played. This is can be applied to 

- Limiting the "validity period" within which a media file is licensed to play
- Defining items that only play on certain days of the week
- Allowing micro adjustment to playlists based on player ID/meta-data
- The general format to specifying a conditional play is by adding the `expr` tag to a media item, such as

```xml
<seq repeatCount="indefinite">
   <seq>
      <video src="everyday.mp4" />
      <video src="mondays.mp4" expr="1=weekday()" />
   </seq>
</seq>
```

Only when the expression provided evaluates to `true` is the associated media item played.

In the sample code, item "everyday.mp4" is played every day the player is on, while item "mondays.mp4" is *only played on Mondays.*

## Supported Functions

The content of the `expr` tag is an HTML-encoded XPath expression. Following player-specific run-time conditional functions:

| Function name | Description | Example (Shown with HTML-encoding) |
| ----------- | ----------- | ----------- |
| smil-playerId() | Returns playerId defined in Timing config as `playerId` in lower case. | expr="compare(smil-playerId(),'f1835d9f-be8f-4054-9e6c-123456789012')" |
| smil-playerName() | Returns player name defined in Timing config as `playerName`. | expr="compare(smil-playerName(),'Entrance')" |
| date() | Returns player's local date-time in ISO8601 format. | expr="compare(date(),'2021-01-01T00:00:00')<0" |
| gmdate() | Returns player's UTC date-time in ISO8601 format (ending in UTC indicator "Z"). | expr="compare(gmdate(),'2021-01-01T00:00:00Z')<0" |
| time() | Returns player time in HH:MM:SS, 24 hours format | expr="compare(time(),'16:29:15')<0" |
| weekday() | Returns a number from 0 (Sunday) to 6 (Saturday) indicating player's local day-of-week. | expr="weekday()=1" |
| gmweekday() | Returns a number from 0 (Sunday) to 6 (Saturday) indicating player's UTC day-of-week. | expr="gmweekday()=1" |
| compare(string comp1, string comp2) | Returns -1 if comp1 is "less" than comp2 as a string, 0 if equal, 1 if "greater". | expr="compare(date(),'2021-01-01T00:00:00')<0" |

If you are working with a legacy implementation of the SMIL, you are probably using `adapi-` prefix for functions above. You can keep using it, signageOS SMIL Player supports these functions with or without the `adapi-` prefix.

### compare() in detail

`compare()` compares two inside arguments. The result of the comparison is then evaluated against `>`, `=` and `<`.

| Example | compare() output | Expression result |
| ----------- | ----------- | ----------- |
| compare(5, 10) | -1 | -- |
| compare(10, 10) | 0 | -- |
| compare(20, 10) | 1 | -- |
| compare('2021-01-01T00:00:00', '2021-02-28T00:00:00') > 0 | -1 | false |
| compare('2021-01-01T00:00:00', '2021-01-01T00:00:00') >= 0 | 0 | true |
| compare('2021-12-31T00:00:00', '2021-01-01T00:00:00') > 0 | 1 | true |


## Usage

### Single condition

#### Play from Wednesday to Saturday

The `weekday()>=3` says to be true and activate the `<par>` playlist every time the day of the week is >= Wednesday.

This playlists will then be active every Wednesday, Thursday, Friday, Saturday.

```xml
<par expr="weekday()>=3">
    <!-- indefinite loop of media files in the selected order -->
    <seq repeatCount="indefinite">
        <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4" region="top-left" soundLevel="0%"></video>
        <img dur="3" src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.jpg" region="top-left" fit="fill"></img>
    </seq>
</par>
```

### Play from 25th of January 2021

The `compare(date(),'2021-01-25T00:00:00')>=0` is valid and true every day since 25th of Jan 2021.

- compare() returns `-1` if date() is less than '2021-01-25T00:00:00'
- compare() returns `0` if date() is equal to '2021-01-25T00:00:00'
- compare() returns `1` if date() is higher than '2021-01-25T00:00:00'

The `<par>` playlist will be active from 25th of Jan onwards.

```xml
<par expr="compare(date(),'2021-01-25T00:00:00')>=0">
    <!-- indefinite loop of media files in the selected order -->
    <seq repeatCount="indefinite">
        <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4" region="top-left" soundLevel="0%"></video>
        <img dur="3" src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.jpg" region="top-left" fit="fill"></img>
    </seq>
</par>
```

### Play from Sunday to Wednesday between 1st of Jan to 1st of Feb

You can mix and match [wallclock begin and end attributes](https://docs.signageos.io/hc/en-us/articles/4405244572178) and expressions to get the desired behavior

```xml
<par begin="wallclock(R/2021-01-01T00:00:00/P1D)" end="wallclock(R/2021-02-01T23:59:59/P1D)" expr="weekday()<=3">
    <!-- indefinite loop of media files in the selected order -->
    <seq repeatCount="indefinite">
        <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4" region="top-left" soundLevel="0%"></video>
        <img dur="3" src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.jpg" region="top-left" fit="fill"></img>
    </seq>
</par>
```

### More About Wallclock

Robust time mechanism handling dates, times, recurring events and more.


### Multiple compound conditions

For a more complex use cases you can combine multiple conditions with logical `AND`, and `OR`.

#### Simple combinations

Simple combinations of conditions are achieved by using `AND` and `OR` in between conditions.

*Plays on Sunday or Saturday:*

```xml
weekday()=0 or weekday()=6
```

#### Complex combinations

Complex combinations are also using `AND` and `OR`, but you can wrap a sequence of conditions in `[]` and combine multiple conditions in one expression.

*Plays from Monday to Friday between 9:00 - 16:00 or Saturday and Sunday between 10:00 and 15:00*

```xml
// final expression
[weekday()>=1 and weekday()<=5 and compare(time(), '09:00:00')>0 and compare(time(), '16:00:00')<0] or [[weekday()=0 or weekday()=6] and compare(time(), '10:00:00')>0 and compare(time(), '15:00:00')<0]

// human readable
[
    weekday()>=1 
    and 
    weekday()<=5 
    and 
    compare(time(), '09:00:00')>0 
    and 
    compare(time(), '16:00:00')<0
] 
or 
[
    [
        weekday()=0 or weekday()=6
    ] 
    and 
    compare(time(), '10:00:00')>0 
    and 
    compare(time(), '15:00:00')<0
]
```

### More Examples

#### Play on Sunday or Saturday

The following expression will activate playlist on Saturday and Sunday: `weekday()=0 or weekday()=6`

```xml
<par expr="weekday()=0 or weekday()=6">
    <!-- indefinite loop of media files in the selected order -->
    <seq repeatCount="indefinite">
        <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4" region="top-left"></video>
        <img dur="3" src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.jpg" region="top-left"></img>
    </seq>
</par>
```

#### Play between 25th of Jan and 29th of Jan (including)

The following expression is comparing date via `compare` and checking whether the date is greater than 25th of Jan and less than 30th of Jan.
`compare(date(), '2021-01-25T00:00:00')>0 and compare(date(), '2021-01-29T23:59:59')<=0`

```xml
<par expr="compare(date(), '2021-01-25T00:00:00')>0 and compare(date(), '2021-01-29T23:59:59')<=0">
    <!-- indefinite loop of media files in the selected order -->
    <seq repeatCount="indefinite">
        <video src="https://static.signageos.io/assets/video-test-1_e07fc21a7a72e3d33478243bd75d7743.mp4" region="top-left"></video>
        <img dur="3" src="https://signageos-demo.s3.eu-central-1.amazonaws.com/smil/samples/assets/landscape1.jpg" region="top-left"></img>
    </seq>
</par>
```
