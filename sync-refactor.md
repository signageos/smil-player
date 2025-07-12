# SMIL Player Sync Behavior Analysis

## Overview

The SMIL Player implements a sophisticated synchronization mechanism that allows multiple devices to coordinate playback
of multimedia content. The sync functionality is primarily handled through the `handleElementSynchronization` function
in `playlistProcessor.ts` and utilizes the signageOS sync API.

## Core Sync Mechanism

### 1. Main Sync Function: `handleElementSynchronization`

Located in `src/components/playlist/playlistProcessor/playlistProcessor.ts:2386`, this function orchestrates the
synchronization of media elements across devices.

**Key responsibilities:**

- Manages sync timing for media elements before and after playback
- Coordinates with other devices using sync groups
- Handles dynamic playlist synchronization
- Prevents race conditions during sync operations

### 2. The `wait` Method

The sync coordination is achieved through `sos.sync.wait()` (line 2483):

```typescript
desiredSyncIndex = await this.sos.sync.wait(value.syncIndex, groupName);
```

This method:

- Blocks execution until all devices in the sync group reach the same sync point
- Takes a sync index (number) and group name as parameters
- Has an optional timeout parameter (though the SMIL player doesn't use it)
- Returns the desired sync index that all devices should use
- Enables frame-accurate synchronization across multiple displays

## Sync Architecture

### Data Model

The `Synchronization` type (from `src/models/syncModels.ts`) contains:

```typescript
type Synchronization = {
	syncValue: number | undefined;        // Current sync index
	shouldSync: boolean;                  // Whether sync is enabled
	syncGroupIds: string[];              // Device group IDs
	syncGroupName: string;               // Base sync group name
	syncDeviceId: string;                // Unique device identifier
	syncingInAction: boolean;            // Sync operation in progress
	movingForward: boolean;              // Moving to next sync point
	shouldCancelAll: boolean;            // Cancel all content flag
};
```

### Sync Group Naming Convention

The system uses hierarchical group names:

- Base: `{syncGroupName}` (used for sync-prefixed triggers)
- Region-specific: `{syncGroupName}-{regionName}-before` and `{syncGroupName}-{regionName}-after`
- Dynamic content: `{syncGroupName}-{regionName}-{dynamicSyncId}`
- Priority sync: `{syncGroupName}-prioritySync`
- Idle priority: `{syncGroupName}-idlePrioritySync`
- Full screen triggers: `{syncGroupName}-fullScreenTrigger`

## Sync Flow

### 1. Initialization Phase

On startup (`joinAllSyncGroupsOnSmilStart` in `syncTools.ts`):

- Reads sync configuration from signageOS config
- Joins sync groups for all regions marked with `sync` attribute
- Establishes connections to sync server (Redis-based or P2P)

### 2. Before Playback Sync

When `suffix === 'before'`:

- Marks the element as playing to prevent interruption
- All devices wait at `sync.wait()` until synchronized
- Broadcasts sync status for master dynamic playlists
- Updates sync value if needed

### 3. After Playback Sync

When `suffix === 'after'`:

- Skips if sync is already in progress or moving forward
- Allows devices to resynchronize after content playback
- Manages transition to next content item

### 4. Dynamic Playlist Sync

Special handling for dynamic content:

- Includes dynamic playlist ID in group name
- Master device (determined by XML configuration) broadcasts sync events
- Slave devices follow master's lead
- Handles start/end events for coordinated playback
- Sends sync wait reports only from master devices
- Uses `broadcastEndActionToAllDynamics` when SMIL stops

## Key Features

### 1. Multi-Level Synchronization

- **Region-level**: Each region can have independent sync
- **Element-level**: Individual media items sync before/after playback
- **Priority-level**: Priority content has separate sync groups
- **Trigger-level**: Sync-prefixed triggers share common sync group

### 2. Sync State Management

- `syncingInAction`: Prevents concurrent sync operations
- `movingForward`: Indicates progression to next item
- `syncValue`: Maintains current sync position
- `syncDeviceId`: Unique device identifier for group membership

### 3. syncIndex Generation

The system uses `computeSyncIndex` to generate unique sync indices:
- **Local sync index**: For triggers and dynamic playlists (incremented per seq tag)
- **Global sync index**: For regular playlist elements (incremented per region)

### 4. Broadcast Mechanism

- `sync.broadcastValue`: Sends sync events to other devices
- Used for dynamic playlist coordination
- Includes unique `requestUid` for tracking
- Broadcasts actions like 'end' to synchronize state changes

### 5. Error Handling

- Retry mechanism for sync server connection with exponential backoff
- Graceful degradation if sync fails
- App restart capability for Samsung devices (limited to 3 restarts)

### 6. Non-Sync Content Handling

- Tracks consecutive non-sync elements
- Removes sync preparation after multiple non-sync items
- Allows mixed sync/non-sync content in same playlist

### 7. SMIL Sync Attribute

- Regions marked with `sync` attribute in SMIL XML participate in synchronization
- Nested regions can independently have sync enabled
- Sync is determined at the SMIL authoring level

## Current Implementation Strengths

1. **Robust State Management**: Clear separation of sync states prevents race conditions
2. **Flexible Group System**: Hierarchical naming allows complex sync scenarios
3. **Dynamic Content Support**: Special handling for dynamic playlists
4. **Error Recovery**: Built-in retry and recovery mechanisms

## Potential Areas for Improvement

1. **Sync Timeout**: The SMIL player doesn't utilize the optional timeout parameter in sync.wait(), potentially blocking indefinitely if devices fail to sync
2. **Network Dependency**: Heavy reliance on network connectivity - devices can go out of sync due to unpredictable conditions
3. **Complexity**: Multiple sync groups and states can be difficult to debug
4. **Performance**: Blocking wait operations may impact responsiveness
5. **Initial syncValue**: The mechanism for determining initial consensus between devices is not clear
6. **Priority vs Idle Priority**: The distinction between prioritySync and idlePrioritySync groups needs clarification

## Sync Server Architecture

The system supports two sync engines (as per signageOS documentation):

1. **SyncServer**: Uses a central server for synchronization (Redis-based)
2. **P2PLocal**: Peer-to-peer synchronization for local networks

Key requirements:
- All devices must use the same sync engine to communicate
- Connection is established through `connectSyncSafe()` with automatic retry logic
- Devices can join multiple groups after connecting
- Groups provide isolation between different sets of synchronized devices

## Additional Implementation Details

### Sync Reports
- Master devices send `SMIL.SyncWait-Started` and `SMIL.SyncWait-Ended` reports
- Reports include source information, timestamp, and group name
- Only sent for dynamic playlist synchronization

### Trigger Integration
- Triggers with "sync-" prefix participate in synchronization
- All sync triggers join the base sync group: `{syncGroupName}`
- Enables synchronized sensor/trigger responses across displays

### syncContentPrepared Tracking
- Maintains state of content prepared for sync
- Tracks `syncGroupName` and `numberOfNonSync` elements
- Clears preparation after multiple non-sync elements

## Conclusion

The current sync implementation provides comprehensive multi-device synchronization with support for complex scenarios including dynamic content, priority playback, region-specific timing, and trigger synchronization. The architecture ensures frame-accurate playback across displays through unique sync indices and coordinated wait points. While robust, there are opportunities to improve timeout handling and simplify the state management for easier debugging.
