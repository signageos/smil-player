# Backup Image

The SMIL player has the option to set up a backup image to avoid a black screen if something goes wrong during the SMIL
file download (e.g., the file does not exist) or during XML to JSON conversion (e.g., invalid XML).

A default backup image is provided by SignageOs, which is locally stored in the SMIL player's repository.

Currently, only a single image is supported.

## Setup

There are two options for setting up your backup image.

There are two options how you can setup your backup image.

### Option 1 - Image stored locally in SMIL repository

Store the image locally in the `public/backupImage/backupImage.jpg` file. The name of the backup image has to be
`backupImage.jpg` at the moment.

### Option 2 - Provide URL to image via timings in Box

The URL has to be stored in the `backupImageUrl` variable in timings in the applet definition. The name of the file does
not matter in this case.

![Set backup image in applet configuration](../extras/backupImage-timings.png)
