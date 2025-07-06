# SMIL Player Sync Migration Plan: Wait-Based → Event-Based

## Overview

This document outlines the migration plan to replace the current wait-based synchronization mechanism (`sync.wait()`)
with an event-based approach using state broadcasting and coordination. The new implementation will eliminate blocking
operations while maintaining frame-perfect synchronization through content preparation.

## Key Architectural Decisions

### Master Selection

- **Use signageOS native `isMaster()`** (not custom MasterSelector)
- Single master per SMIL file coordinates all sync regions
- Master status determined by signageOS SDK

### Sync Group Strategy

- **Separate sync groups per region** with `sync="true"` attribute
- Group naming: `${syncGroupName}-${regionName}-before/after`
- Single master coordinates multiple region groups
- Maintain existing SMIL XML compatibility

### Frame-Perfect Sync Strategy

- **Achieve sync through content preparation**, not timing
- State transitions only when content is fully prepared
- Master coordinates "go" signals via state broadcasts
- Pre-load next content while current plays

---

## Phase 1: Foundation & Core Components (2-3 weeks)

### Step 1.1: Create Event-Based Sync Infrastructure

**Files to create/modify:**

- `src/components/playlist/tools/SyncGroup.ts` (port from sync-example)
- `src/components/playlist/tools/IMasterStatusProvider.ts` (port interface)
- `src/models/syncModels.ts` (update with event-based models)

**Key changes:**

- Port `SyncGroup` wrapper around signageOS sync API
- Use signageOS `isMaster()` instead of custom master selection
- Add event emitter for local state distribution
- Remove MasterSelector dependency

### Step 1.2: Replace syncTools.ts

**Complete rewrite of:**

- `joinAllSyncGroupsOnSmilStart()` function
- `connectSyncSafe()` integration with event-based groups
- Group lifecycle management

**New functionality:**

- Parse SMIL regions with `sync="true"` attribute
- Create separate sync groups per sync-enabled region
- Maintain existing group naming conventions
- Remove all `sync.wait()` related infrastructure

### Step 1.3: Update Synchronization Model

**Keep existing (required for tree navigation):**

- `syncingInAction: boolean` ✅ - needed for recursive tree traversal
- `movingForward: boolean` ✅ - needed for navigation state
- `syncGroupName: string`
- `syncGroupIds: string[]`
- `shouldSync: boolean`
- `syncDeviceId: string`

**Remove from `Synchronization` type:**

- `syncValue: number | undefined` ❌ - replace with target-based navigation

**Add to `Synchronization` type:**

- `targetSyncIndex?: number` - target element to navigate to
- Element state tracking for event-based coordination
- Master status monitoring
- Region-specific group mapping

### Step 1.4: Random-Access Tree Navigation Architecture

**New Component:** Element Registry for O(1) element lookup

**Files to create/modify:**

- `src/components/playlist/playlistDataPrepare/ElementRegistry.ts` (new)
- `src/components/playlist/playlistDataPrepare/playlistDataPrepare.ts` (enhance getAllInfo)
- `src/models/playlistModels.ts` (add ElementRegistryEntry interface)

**Element Registry Design:**

```typescript
interface ElementRegistryEntry {
	element: PlaylistElement;          // Full element reference (all info)
	regionName: string;
	syncIndex: number;
	parentRef: WeakRef<any>;          // Parent object in tree
	parentKey: string;                // Key in parent (e.g., "video[2]")
	navigationPath: string[];         // Path to element in tree
	contextInfo: {
		currentIndex?: number;          // For array elements
		siblingCount?: number;          // Total siblings
		depth: number;                  // Tree depth
	};
}

class ElementRegistry {
	private registry = new Map<string, ElementRegistryEntry>(); // key: "${regionName}-${syncIndex}"
	private regionElements = new Map<string, ElementRegistryEntry[]>(); // regionName -> elements
}
```

**Key Methods:**

- `getElementBySyncIndex(regionName: string, syncIndex: number): ElementRegistryEntry`
- `navigateToElement(regionName: string, syncIndex: number): PlaylistElement`
- `getRegionElements(regionName: string): ElementRegistryEntry[]`
- `getNextElement(regionName: string, currentSyncIndex: number): ElementRegistryEntry`

**Enhanced getAllInfo Integration:**

- Build registry during existing recursive traversal
- Store full element references for complete info access
- Track navigation paths and parent references
- Maintain O(1) lookup capability

**Memory Management:**

- Use WeakRef for parent objects to prevent memory leaks
- Registry can be rebuilt if tree structure changes
- Leverage existing dynamic update mechanisms (no modifications needed)

**Benefits:**

- O(1) element lookup by syncIndex instead of tree traversal
- Direct navigation for event-based sync coordination
- Maintains backward compatibility with existing recursive navigation
- Enables efficient random access while preserving all current functionality

---

## Phase 2: SMIL Element State Machine (2-3 weeks)

### Step 2.1: Create SMILElementController

**New file:** `src/components/playlist/playlistProcessor/SMILElementController.ts`

**State machine:**

```
Idle → Prepared → Playing → Finished
```

**States definition:**

- `Idle`: No content loaded
- `Prepared`: Content loaded and ready to play
- `Playing`: Content actively playing
- `Finished`: Content completed

**Supported media types:**

- Video elements
- Image elements
- Audio elements
- Widget elements
- Ticker elements

**Key features:**

- State broadcasting to appropriate sync groups
- Master drives state transitions
- Slaves follow master's state broadcasts
- Pre-loading of next element during current playback

### Step 2.2: Replace handleElementSynchronization

**Remove completely:**

- `handleElementSynchronization()` function (lines 2386-2549)
- All `await this.sos.sync.wait()` calls (3 locations)

**Replace with:**

- `handleElementStateSync()` using event-based coordination
- State broadcasting for master devices
- State listening for slave devices with target-seeking navigation
- Before/after sync points as state transitions

**Target-Seeking Navigation:**

- When slaves receive sync events with `{regionName, syncIndex}`
- Use Element Registry for O(1) lookup: `getElementBySyncIndex(regionName, syncIndex)`
- Direct navigation to target element instead of tree traversal
- Set `targetSyncIndex` in synchronization state for the specific region
- Existing navigation logic adapted to seek target during traversal

**Integration points:**

- Called from `playHtmlContent()` and `playVideo()` methods
- Integrated with Element Registry for fast element access
- Coordinated with priority and trigger systems
- Maintains existing tree navigation for complex scenarios

### Step 2.3: Element Preparation Strategy

**Frame-perfect sync approach:**

- Pre-load/prepare next element while current element plays
- Only transition to `Playing` state when element is fully prepared
- Master coordinates synchronized "go" signals
- Eliminate timing-dependent synchronization

**Implementation details:**

- Resource preloading (videos, images, widgets)
- DOM preparation for HTML elements
- Memory management and cleanup
- Error handling for failed preparations

---

## Phase 3: SMIL Integration (3-4 weeks)

### Step 3.1: Update Playlist Processing

**Files to modify:**

- `src/components/playlist/playlistProcessor/playlistProcessor.ts`
- Methods: `playHtmlContent()`, `playVideo()`, `processPlaylist()`

**Key changes:**

- Remove all `await this.sos.sync.wait()` calls:
    - Line 2483: Element synchronization
    - Lines 783-786: Idle priority sync
    - Line 804: Priority sync before wallclock
- Integrate `SMILElementController` into processing loop
- Replace blocking sync with state machine coordination

**New processing flow:**

1. Parse SMIL elements and build Element Registry
2. Create state controllers per sync region
3. Master drives state transitions and broadcasts `{regionName, syncIndex}`
4. Slaves receive events and use Element Registry for direct navigation
5. Target-seeking: set `targetSyncIndex` and navigate directly to element
6. Coordinate multiple regions through separate groups

### Step 3.2: Complex SMIL Features

**Dynamic Playlists:**

- Master/slave coordination per region
- Dynamic content state broadcasting
- Integration with existing dynamic playlist system
- Maintain compatibility with dynamic triggers

**Priority Content:**

- Interruption via state broadcasting
- Priority sync group coordination
- Integration with existing priority system
- Wallclock-based priority scheduling

**Wallclock Scheduling:**

- Event-based timing coordination
- Replace wallclock sync waits with state events
- Maintain precise timing through preparation
- Integration with existing wallclock tools

**Trigger Integration:**

- Sync-prefixed triggers use base sync group
- Trigger state broadcasting
- Coordination with sensor inputs
- Maintain existing trigger functionality

### Step 3.3: Region-Specific Sync Groups

**Group creation strategy:**

- Parse SMIL layout for `sync="true"` regions
- Create groups: `${syncGroupName}-${regionName}-before/after`
- Single master coordinates all regional groups
- State broadcasts targeted to specific region groups

**Example SMIL integration:**

```xml

<region regionName="region1" sync="true"/>
<region regionName="region2" sync="true"/>
```

**Results in groups:**

- `syncGroupName-region1-before`
- `syncGroupName-region1-after`
- `syncGroupName-region2-before`
- `syncGroupName-region2-after`

**Master coordination:**

- Single master (signageOS `isMaster()`) for entire SMIL
- Master broadcasts region-specific state changes
- Slaves listen to their region's sync groups
- Coordinated state transitions across regions

---

## Phase 4: Advanced Features (2-3 weeks)

### Step 4.1: Enhanced State Management

**Element Pre-loading:**

- Next element preparation during current playback
- Seamless transitions between elements
- Resource optimization and memory management
- Error handling for preparation failures

**State Persistence:**

- Recovery scenarios for device disconnections
- State catch-up for late-joining devices
- Persistent state storage across sessions
- Master failover state continuity

**Peer Health Monitoring:**

- Automatic detection of disconnected devices
- Cleanup of orphaned sync groups
- Network partition detection
- Graceful degradation strategies

### Step 4.2: SMIL-Specific Optimizations

**Nested Regions:**

- Complex region hierarchies
- Nested sync group coordination
- Parent-child region relationships
- Inheritance of sync properties

**Multiple Media Types:**

- Coordinated playback across different media
- Resource management per media type
- Type-specific preparation strategies
- Cross-media synchronization

**Resource Management:**

- Memory cleanup and optimization
- Large file handling strategies
- Network bandwidth optimization
- Cache management for repeated content

### Step 4.3: Error Handling & Resilience

**Master Failover:**

- Automatic master transition handling
- State continuity during failover
- Minimal disruption to ongoing playback
- Recovery from split-brain scenarios

**Network Resilience:**

- Temporary disconnection handling
- Reconnection and state synchronization
- Bandwidth adaptation strategies
- Offline mode considerations

**Error Recovery:**

- Failed element preparation handling
- Corrupted content recovery
- Sync group communication failures
- Fallback content strategies

---

## Phase 5: Testing & Validation (2-3 weeks)

### Step 5.1: SMIL Compatibility Testing

**Test Suite Coverage:**

- All SMIL files in `cypress/testFiles/`
- Complex region configurations
- Multiple sync regions per SMIL
- Nested region scenarios

**Specific Test Cases:**

- `syncFiles/wallclockSync.smil`: Basic sync region testing
- `syncFiles/triggerFailover*.smil`: Failover scenarios
- Dynamic playlist SMIL files
- Complex wallclock scheduling

**Validation Criteria:**

- Frame-perfect synchronization maintained
- All SMIL features functional
- Performance equivalent or better
- Memory usage optimization

### Step 5.2: Performance & Accuracy Testing

**Multi-Device Sync Testing:**

- 2+ device synchronization validation
- Network latency impact assessment
- Master failover testing
- Large-scale deployment simulation

**Frame Accuracy Validation:**

- High-speed camera verification
- Timestamp accuracy measurement
- Cross-device timing validation
- Content preparation timing analysis

**Load Testing:**

- Complex SMIL files with multiple regions
- High media content scenarios
- Extended playback duration testing
- Resource cleanup validation

**Performance Benchmarking:**

- CPU usage comparison (old vs new)
- Memory usage optimization validation
- Network bandwidth utilization
- Startup time improvements

---

## Implementation Priority & Dependencies

### Phase Dependencies:

1. **Phase 1** → **Phase 2**: Core infrastructure before state machine
2. **Phase 2** → **Phase 3**: State machine before SMIL integration
3. **Phase 3** → **Phase 4**: Basic functionality before optimizations
4. **Phase 4** → **Phase 5**: Complete implementation before testing

### Critical Path Items:

1. SyncGroup event infrastructure
2. Element Registry for random-access navigation
3. SMILElementController state machine with target-seeking
4. Playlist processing integration with direct element access
5. Multi-region coordination with event-based sync

### Risk Mitigation:

- Incremental implementation with testing at each phase
- Backup strategies for complex SMIL scenarios
- Performance monitoring throughout development
- Compatibility validation with existing SMIL library

---

## Success Criteria

### Functional Requirements:

- ✅ Complete removal of `sync.wait()` calls
- ✅ Frame-perfect synchronization maintained
- ✅ All existing SMIL features functional
- ✅ Multi-region sync support
- ✅ Master/slave coordination working

### Performance Requirements:

- ✅ Equal or better sync accuracy
- ✅ Reduced blocking operations
- ✅ Improved responsiveness
- ✅ Optimized resource usage

### Compatibility Requirements:

- ✅ Existing SMIL files work unchanged
- ✅ signageOS integration maintained
- ✅ All test cases passing
- ✅ API compatibility preserved

---

## Future Considerations

### Potential Enhancements:

- State persistence across app restarts
- Advanced peer discovery mechanisms
- Bandwidth optimization strategies
- Enhanced debugging and monitoring tools

### Maintenance Considerations:

- Simplified sync logic for easier debugging
- Improved error messages and logging
- Better separation of concerns
- Enhanced test coverage

This plan provides a structured approach to migrating from wait-based to event-based synchronization while maintaining
all existing functionality and improving performance characteristics.

---

## Implementation TODO List

### Phase 1: Foundation & Core Components

- [x] **1.1a** Port `SyncGroup.ts` from sync-example to `src/components/playlist/tools/`
- [x] **1.1b** Port `IMasterStatusProvider.ts` interface to `src/components/playlist/tools/`
- [x] **1.1c** Update `src/models/syncModels.ts` with event-based models
- [x] **1.2a** Rewrite `joinAllSyncGroupsOnSmilStart()` in `src/components/playlist/tools/syncTools.ts`
- [x] **1.2b** Update `connectSyncSafe()` for event-based groups
- [x] **1.2c** Remove all `sync.wait()` infrastructure from syncTools.ts
- [x] **1.3a** Update `Synchronization` type - remove `syncValue`, add `targetSyncIndex`
- [x] **1.3b** Keep `syncingInAction` and `movingForward` for tree navigation
- [x] **1.4a** Create `src/components/playlist/playlistDataPrepare/ElementRegistry.ts`
- [x] **1.4b** Add `ElementRegistryEntry` interface to `src/models/playlistModels.ts`
- [ ] **1.4c** Enhance `getAllInfo()` in `playlistDataPrepare.ts` to build Element Registry
- [ ] **1.4d** Implement `getElementBySyncIndex()` and navigation methods

### Phase 2: SMIL Element State Machine

- [ ] **2.1a** Create `src/components/playlist/playlistProcessor/SMILElementController.ts`
- [ ] **2.1b** Implement state machine: Idle → Prepared → Playing → Finished
- [ ] **2.1c** Add state broadcasting to sync groups
- [ ] **2.1d** Implement element pre-loading logic
- [ ] **2.2a** Remove `handleElementSynchronization()` function (lines 2386-2549)
- [ ] **2.2b** Remove all `await this.sos.sync.wait()` calls (3 locations)
- [ ] **2.2c** Create `handleElementStateSync()` with event-based coordination
- [ ] **2.2d** Implement target-seeking navigation using Element Registry
- [ ] **2.3a** Implement content preparation strategy
- [ ] **2.3b** Add resource preloading for videos, images, widgets
- [ ] **2.3c** Implement DOM preparation for HTML elements

### Phase 3: SMIL Integration

- [ ] **3.1a** Modify `playHtmlContent()` in playlistProcessor.ts
- [ ] **3.1b** Modify `playVideo()` in playlistProcessor.ts
- [ ] **3.1c** Update `processPlaylist()` method
- [ ] **3.1d** Integrate SMILElementController into processing loop
- [ ] **3.1e** Replace blocking sync with state machine coordination
- [ ] **3.2a** Update dynamic playlist integration
- [ ] **3.2b** Update priority content handling
- [ ] **3.2c** Update wallclock scheduling
- [ ] **3.2d** Update trigger integration
- [ ] **3.3a** Parse SMIL layout for `sync="true"` regions
- [ ] **3.3b** Create region-specific sync groups
- [ ] **3.3c** Implement region-specific state broadcasting

### Phase 4: Advanced Features

- [ ] **4.1a** Implement next element preparation during playback
- [ ] **4.1b** Add state persistence for recovery scenarios
- [ ] **4.1c** Implement peer health monitoring
- [ ] **4.2a** Handle nested region hierarchies
- [ ] **4.2b** Optimize multiple media types coordination
- [ ] **4.2c** Implement resource management and cleanup
- [ ] **4.3a** Add master failover handling
- [ ] **4.3b** Implement network resilience strategies
- [ ] **4.3c** Add error recovery mechanisms

### Phase 5: Testing & Validation

- [ ] **5.1a** Test all SMIL files in `cypress/testFiles/`
- [ ] **5.1b** Test complex region configurations
- [ ] **5.1c** Test `syncFiles/wallclockSync.smil` and failover scenarios
- [ ] **5.1d** Validate all SMIL features work
- [ ] **5.2a** Multi-device synchronization testing
- [ ] **5.2b** Frame accuracy validation
- [ ] **5.2c** Load testing with complex SMIL files
- [ ] **5.2d** Performance benchmarking vs current implementation

### Critical Milestones

- [ ] **M1** SyncGroup infrastructure working with signageOS
- [ ] **M2** Element Registry providing O(1) element lookup
- [ ] **M3** SMILElementController state machine functional
- [ ] **M4** First sync region working with event-based coordination
- [ ] **M5** All existing SMIL test cases passing
- [ ] **M6** Performance equivalent or better than current implementation
