# Event-Based Sync Implementation Analysis (No-Wait Approach)

## Overview

This proof-of-concept implementation demonstrates an event-driven synchronization mechanism that eliminates the blocking
`sync.wait()` calls used in the current SMIL player. Instead, it relies on `broadcastValue()` and `onValue()` functions
for inter-device communication, combined with Node.js EventEmitter for local event handling.

## Architecture

### Core Principle

The system uses a **master-slave architecture** where:

- One device acts as the master and drives the playback state
- All other devices follow the master's state broadcasts
- Master selection is deterministic and automatic
- No blocking operations - all synchronization is event-driven

## Key Components

### 1. SyncGroup (`SyncGroup.ts`)

Acts as the communication layer wrapper around signageOS sync API:

```typescript
class SyncGroup implements ISyncGroup, IMasterStatusProvider {
	private emitter: EventEmitter = new EventEmitter();

	// Broadcasting values to all devices
	public async broadcastValue(key: string, value: any): Promise<void>

	// Listening for values from other devices
	public onValue(callback: (args: { key: string, value?: any }) => void): void

	// Master status monitoring (uses signageOS native master detection)
	public async isMaster(): Promise<boolean>

	public onMasterChange(callback: (isMaster: boolean) => void): void
}
```

**Key features:**

- Wraps signageOS sync API calls
- Uses EventEmitter to distribute events locally
- Monitors master status changes via `onStatus` callback
- Each device has a unique ID for identification
- **Uses signageOS's native master detection** (not custom algorithm)

### 2. MasterSelector (`MasterSelector.ts`)

Implements **custom deterministic master selection algorithm** (alternative to signageOS native):

```typescript
class MasterSelector implements IMasterStatusProvider {
	private peers: Map<string, Peer> = new Map();

	// Peer structure
	type Peer = {
		id: string;
		joinedAt: number;
		hasPriority: boolean;
	}
}
```

**Master selection algorithm:**

1. Devices with priority flag are preferred
2. Among equal priority, earliest `joinedAt` timestamp wins
3. Consistent ordering ensures all devices agree on master

**Key mechanisms:**

- **Peer discovery**: Devices broadcast "announce" messages periodically
- **Heartbeat**: Regular announcements (every 1s, more frequent when alone)
- **Peer tracking**: Maintains list of active peers with their metadata
- **Dead peer detection**: Removes peers not reported in sync status

**Note**: This provides enhanced master selection with priority support, as an alternative to signageOS's native master detection used by SyncGroup.

### 3. VideoPlayerController (`VideoPlayerController.ts`)

Manages video playback state synchronization:

```typescript
class VideoPlayerController {
	private state: State = { state: VideoPlayerState.Idle, data: null };

	// State broadcasting (master only)
	private async broadcastCurrentState()

	// State monitoring (slaves follow master)
	private monitorStateChanges()
}
```

**State machine states:**

- `Idle`: No video playing
- `Prepared`: Video loaded and ready
- `Playing`: Video currently playing

**Synchronization mechanism:**

1. Master broadcasts state changes
2. Slaves receive state via `onValue` callback
3. Slaves update their local state to match
4. State broadcasts occur on change and periodically (every 5s)

### 4. State Machine (`videoPlayerStateMachine.ts`)

Defines deterministic state transitions:

```
Idle → Prepared → Playing → Playing (next video) → ... → Idle
```

**Key features:**

- Pure function for state transitions
- Deterministic next state calculation
- Handles video sequencing

## Event-Driven Sync Flow

### 1. Initialization

1. Device joins sync group with unique ID
2. Starts announcing itself to peers
3. Begins monitoring for other devices
4. **5-second initialization delay** allows master election to stabilize

### 2. Master Election

1. Devices exchange "announce" messages with metadata
2. Each device independently calculates who should be master
3. When consensus changes, `onMasterChange` event fires

### 3. State Synchronization

1. **Master device**:
    - Drives state machine forward
    - Broadcasts state changes to group
    - Manages video progression

2. **Slave devices**:
    - Listen for state broadcasts
    - Update local state to match master
    - Prepare/play videos as directed

### 4. Master Failover

1. If master disconnects, peers detect via sync status
2. Remaining devices recalculate master
3. New master picks up where previous left off
4. Seamless transition without interruption

## Communication Patterns

### Broadcast Types

1. **Announce messages** (peer discovery):
   ```javascript
   broadcastValue('announce', {
       id: deviceId,
       joinedAt: timestamp,
       hasPriority: boolean
   })
   ```

2. **State messages** (video controller):
   ```javascript
   broadcastValue('state', {
       state: VideoPlayerState,
       data: { uid: videoId }
   })
   ```

3. **Periodic video state**:
   ```javascript
   broadcastValue('periodicVideo.state', 'inactive' | 'playing' | 'waiting')
   ```

4. **Triggered video commands**:
   ```javascript
   broadcastValue('triggered.state', videoState)
   broadcastValue('triggered.start', triggerData)
   ```

### Event Flow Example

```
Device A (Master)              Device B (Slave)
     |                              |
     |----announce (A)----->        |
     |                              |
     |<----announce (B)------       |
     |                              |
     |  [Calculates: A is master]   |  [Calculates: A is master]
     |                              |
     |----state: Prepared--->       |
     |                              |  [Updates to Prepared]
     |----state: Playing---->       |
     |                              |  [Updates to Playing]
     |                              |
```

## Advantages Over Wait-Based Approach

### 1. Non-Blocking Operation

- No `sync.wait()` calls that block execution
- Responsive to state changes and interruptions
- Better handling of edge cases (disconnections, delays)

### 2. Simplified State Management

- Single source of truth (master's state)
- No complex sync point calculations
- Clear separation of concerns

### 3. Resilient Architecture

- Automatic master failover
- Peer discovery and tracking
- Graceful handling of network issues

### 4. Flexible Timing

- State machine can be interrupted (100ms check intervals)
- Videos can have safety margins for timing
- No rigid synchronization points

## Implementation Details

### Video Timing Management

The controller uses a hybrid approach:

- Tracks expected video end time
- Polls for actual ended event (100ms interrupt intervals)
- **10ms safety margin** for accurate end detection
- **Video pre-loading**: Next video loads while current plays
- Uses Promise.race for flexible timing:
  ```javascript
  Promise.race([
      wait(100),                    // Interrupt check
      video.onceEnded(),           // Actual end event
      wait(remainingTime + 10)     // Safety timeout with margin
  ])
  ```

### Master-Only Operations

Certain operations only execute on master:

- State machine progression (`doNext()`)
- State broadcasting
- Video sequencing decisions

### Debug Support

- Each component has debug logging via `debug` package
- Master status shown visually (CSS class)
- Comprehensive state change logging

## Video Player Types

The implementation supports multiple synchronized video player types:

### 1. PeriodicVideoPlayer
- Plays videos on a fixed schedule (e.g., every 5 seconds)
- Uses `periodicVideo.state` broadcasts
- Automatically pauses when triggered content starts

### 2. TriggeredVideoPlayer
- Plays videos on-demand (button click, sensor input)
- Uses `triggered.start` and `triggered.state` broadcasts
- Pauses periodic player during triggered playback
- Resumes periodic player when triggered content ends

### 3. Video Coordination
- Separate sync groups prevent conflicts
- Triggered content has priority over periodic
- State machines coordinate pause/resume behavior

## Configuration Requirements

The system requires specific configuration:

```javascript
{
    syncEngine: 'SyncServer' | 'P2PLocal',
    syncServerUri: 'redis://server:port',  // For SyncServer engine
    syncId: 'unique-session-id',
    periodicVideos: 'url1,url2,url3',
    triggeredVideos: 'url1,url2',
    debugMode: true                        // Visual master indicators
}
```

## Potential Improvements

1. **State Persistence**: Store last known state for recovery
2. **Conflict Resolution**: Handle simultaneous state changes
3. **Network Partition**: Detect and handle split-brain scenarios
4. **State Validation**: Verify state consistency across devices
5. **Bandwidth Optimization**: Reduce announcement frequency when stable

## Comparison with Current SMIL Sync

| Aspect           | Current (Wait-Based)        | New (Event-Based)    |
|------------------|-----------------------------|----------------------|
| Blocking         | Yes (`sync.wait()`)         | No                   |
| Master Selection | XML Configuration           | Automatic/Dynamic    |
| State Sync       | Sync points                 | Continuous           |
| Complexity       | High (multiple sync groups) | Lower (single state) |
| Failover         | Manual                      | Automatic            |
| Timing           | Frame-accurate              | Event-driven         |
| Video Pre-loading| No                          | Yes (next video)     |
| Player Types     | Single unified              | Multiple coordinated |
| Configuration    | SMIL XML                    | JavaScript config    |

## Critical Features Missing from Current SMIL Player

Based on this analysis, the current SMIL player lacks several important sync capabilities:

1. **Dual Master Selection**: Only uses XML-configured masters, no dynamic failover
2. **Video Pre-loading**: No next-video preparation for seamless transitions  
3. **Player Type Coordination**: No mechanism for triggered vs periodic content coordination
4. **State Broadcasting**: Relies on sync points rather than continuous state sync
5. **Peer Health Monitoring**: No automatic detection and cleanup of dead peers
6. **Priority-Based Master Selection**: No support for device priority in master election
7. **Safety Timeouts**: No safety margins for stuck video elements
8. **Late-Joining Device Support**: No state catch-up mechanism for devices joining mid-playback

## Conclusion

This event-based approach provides a more flexible and resilient synchronization mechanism compared to the blocking wait-based approach. By leveraging broadcast messaging and deterministic master selection, it achieves synchronized playbook without the complexity of coordinating specific sync points. The architecture is particularly well-suited for scenarios where devices may join/leave dynamically and network conditions vary.

Key advantages include automatic failover, video pre-loading, multiple player type coordination, and elimination of blocking operations that can cause performance issues in complex SMIL playlists.
