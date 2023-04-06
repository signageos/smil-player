# HDMI and DP Video Inputs (PictureInPicture)

signageOS SMIL Player supports showing of video inputs like HDMI or DisplayPort on devices that support this functionality (SoC displays like Samsung Tizen, LG webOS).

## Basic usage

```xml
<video src="internal://hdmi1" isStream="true" dur="10" />
```

> For signageOS SMIL Player to correctly recognize streams, it is necessary to include `isStream="true"` in video tag.
>
> It is possible to specify the duration of the stream in the same way as any other media in SMIL by specifying `dur` attribute.
>
> If no `dur` attribute is specified, the stream will play indefinitely.

|> **Values**|> **Description**|
| :- | :- |
|> internal://hdmi|> HDMI|
|> internal://dp|> DisplayPort|
|> internal://dvi|> DVI|
|> internal://pc|> PC or VGA|
>
