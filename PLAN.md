# Temp Folder Solution Implementation Plan

## Problem Statement
When content moves between URLs (e.g., URL A gets new content and URL B now points to URL A's old content), the current implementation overwrites files causing playback issues. The system needs to handle content movement without file overwrites or unnecessary re-downloads.

## Solution Overview
Implement a temporary folder approach where new files are downloaded to temp storage first, then migrated to standard locations after analysis. This prevents overwrites of files still needed by other URLs.

## Key Design Decisions
1. **MediaInfo updates**: Only update after all operations complete (last step)
2. **Temp folder location**: Create `tmp/` subdirectories within existing media folders
3. **LocalFilePath**: Always points to standard folder, never to tmp
4. **Detection mechanism**: Use location headers to detect content changes
5. **Failure handling**: No full transaction - partial success is acceptable

## Implementation Steps

### Step 1: Add Temp Folder Structure
**Files to modify:**
- `src/enums/fileEnums.ts`
- `src/components/files/filesManager.ts`

**Changes:**
- Add temp folder paths to FileStructure enum:
  ```typescript
  export enum FileStructure {
    // ... existing entries
    videosTmp = 'smil/videos/tmp',
    imagesTmp = 'smil/images/tmp',
    audiosTmp = 'smil/audios/tmp',
    widgetsTmp = 'smil/widgets/tmp',
  }
  ```
- Update `createFileStructure()` to create temp folders

### Step 2: Track Temp Downloads
**Files to modify:**
- `src/components/files/filesManager.ts`
- `src/components/files/IFilesManager.ts`

**Changes:**
- Add property to track files downloaded to temp:
  ```typescript
  private tempDownloads: Map<string, string> = new Map(); // filename -> temp path
  ```
- Add helper to get temp folder for media type:
  ```typescript
  private getTempFolder(standardFolder: string): string {
    switch(standardFolder) {
      case FileStructure.videos: return FileStructure.videosTmp;
      case FileStructure.images: return FileStructure.imagesTmp;
      case FileStructure.audios: return FileStructure.audiosTmp;
      case FileStructure.widgets: return FileStructure.widgetsTmp;
      default: return standardFolder;
    }
  }
  ```

### Step 3: Modify Download Logic
**Files to modify:**
- `src/components/files/filesManager.ts`

**Changes in `parallelDownloadAllFiles`:**
```typescript
public parallelDownloadAllFiles = async (
  filesList: MergedDownloadList[],
  localFilePath: string,
  timeOut: number,
  skipContentHttpStatusCodes: number[],
  updateContentHttpStatusCodes: number[],
  fetchStrategy: FetchStrategy,
  forceDownload?: boolean,
  latestRemoteValue?: number | string,
  useTempFolder?: boolean, // New parameter
): Promise<{ promises: Promise<void>[]; filesToUpdate: Map<string, number | string> }>
```

**Logic changes:**
- When `useTempFolder` is true, download to temp folder
- Track downloads in `tempDownloads` map
- Keep `localFilePath` in media objects pointing to standard location

### Step 4: Update checkLastModified
**Files to modify:**
- `src/components/files/filesManager.ts`

**Changes:**
- When downloading updates (updateCheck.shouldUpdate):
  - Check if content already exists locally
  - If new content: download to temp folder
  - If moved content: skip download, prepare mapping update

```typescript
if (updateCheck.shouldUpdate) {
  const isNewContent = !this.isValueAlreadyStored(updateCheck.value, mediaInfoObject);

  if (isNewContent) {
    // Download to temp folder
    const result = await this.parallelDownloadAllFiles(
      [file],
      localFilePath,
      SMILScheduleEnum.fileCheckTimeout,
      [],
      [],
      fetchStrategy,
      true,
      updateCheck.value,
      true, // Use temp folder
    );
    // ... rest of logic
  } else {
    // Content moved - update mapping only
    // ... existing move detection logic
  }
}
```

### Step 5: Implement Migration Logic
**Files to modify:**
- `src/components/files/filesManager.ts`
- `src/components/files/IFilesManager.ts`

**New method:**
```typescript
private migrateFromTempToStandard = async (
  filesList: MergedDownloadList[],
  mediaInfoObject: MediaInfoObject,
): Promise<void> => {
  // 1. Build map of what content each URL needs
  const urlContentMap = new Map<string, string>(); // URL -> required content value

  // 2. Identify files to keep and delete
  const filesToDelete = new Set<string>();
  const filesToMigrate = new Map<string, string>(); // temp path -> standard path

  // 3. Delete obsolete files
  for (const file of filesToDelete) {
    await this.deleteFile(file);
  }

  // 4. Move files from temp to standard
  for (const [tempPath, standardPath] of filesToMigrate) {
    await this.sos.fileSystem.moveFile({
      storageUnit: this.internalStorageUnit,
      oldPath: tempPath,
      newPath: standardPath,
    });
  }

  // 5. Clear temp folders
  await this.clearTempFolders();

  // 6. Clear tracking
  this.tempDownloads.clear();
}
```

### Step 6: Update Batch Commit
**Files to modify:**
- `src/components/files/filesManager.ts`

**Changes to `commitBatch`:**
```typescript
public commitBatch = async (filesList: MergedDownloadList[]): Promise<void> => {
  if (this.batchUpdates.size === 0 && this.tempDownloads.size === 0) {
    debug('No batch updates or temp downloads to commit');
    return;
  }

  const mediaInfoObject = await this.getOrCreateMediaInfoFile(filesList);

  // Migrate files from temp to standard if needed
  if (this.tempDownloads.size > 0) {
    await this.migrateFromTempToStandard(filesList, mediaInfoObject);
  }

  // Apply batch updates to mediaInfoObject
  for (const [fileName, value] of this.batchUpdates) {
    mediaInfoObject[fileName] = value;
  }

  // Write final mediaInfoObject (last step as requested)
  await this.writeMediaInfoFile(mediaInfoObject);

  this.batchUpdates.clear();
}
```

### Step 7: Add Cleanup Logic
**Files to modify:**
- `src/components/files/filesManager.ts`

**New methods:**
```typescript
private clearTempFolders = async (): Promise<void> => {
  const tempFolders = [
    FileStructure.videosTmp,
    FileStructure.imagesTmp,
    FileStructure.audiosTmp,
    FileStructure.widgetsTmp,
  ];

  for (const folder of tempFolders) {
    try {
      const files = await this.sos.fileSystem.listFiles({
        storageUnit: this.internalStorageUnit,
        filePath: folder,
      });

      for (const file of files) {
        await this.deleteFile(`${folder}/${file.name}`);
      }
    } catch (err) {
      debug('Error clearing temp folder %s: %O', folder, err);
    }
  }
}

private identifyObsoleteFiles = (
  currentMappings: Map<string, string>,
  newMappings: Map<string, string>,
): Set<string> => {
  const obsoleteFiles = new Set<string>();

  for (const [url, oldFile] of currentMappings) {
    const newFile = newMappings.get(url);
    if (newFile && newFile !== oldFile) {
      // Check if any other URL needs this file
      let stillNeeded = false;
      for (const [otherUrl, otherFile] of newMappings) {
        if (otherUrl !== url && otherFile === oldFile) {
          stillNeeded = true;
          break;
        }
      }

      if (!stillNeeded) {
        obsoleteFiles.add(oldFile);
      }
    }
  }

  return obsoleteFiles;
}
```

### Step 8: Update Resource Checker Integration
**Files to modify:**
- `src/components/files/resourceChecker/resourceChecker.ts`

**Changes:**
- Ensure batch operations properly trigger temp folder migration
- Add debug logging for temp folder operations

## Testing Scenarios

### Scenario 1: Basic Content Movement
- URL A gets new content
- URL B now points to URL A's old location
- Verify old content is preserved for URL B
- Verify new content is properly stored for URL A

### Scenario 2: Chain Movement
- URL A → new content
- URL B → URL A's old content
- URL C → URL B's old content
- Verify all content properly preserved and mapped

### Scenario 3: Partial Failure
- Download 5 files, 2 fail
- Verify 3 successful files are migrated
- Verify failed files trigger re-download on next check

### Scenario 4: Concurrent Updates
- Multiple resource intervals updating simultaneously
- Verify batch updates don't interfere with each other
- Verify mediaInfoObject consistency

## Expected Benefits
1. **No overwrites**: Files needed by other URLs won't be overwritten
2. **Network efficiency**: No unnecessary re-downloads
3. **Atomic-like updates**: All-or-nothing migration per batch
4. **Backward compatibility**: Existing logic remains intact
5. **Failure resilience**: Partial success is acceptable

## Rollback Plan
If issues arise:
1. Remove temp folder logic
2. Revert to direct downloads
3. Files in temp can be manually recovered if needed

## Debug Points
Add debug logging at:
- Temp folder creation
- Download to temp decision
- Migration start/end
- File deletion operations
- Batch commit with temp files
- Content move detection

## Future Enhancements
1. Add metrics for temp folder usage
2. Implement automatic temp folder cleanup on startup
3. Add configurable temp folder location
4. Consider using file checksums for duplicate detection