# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SMIL (Synchronized Multimedia Integration Language) Player for digital signage displays, built specifically
for the signageOS platform. It parses and plays multimedia content defined in SMIL playlists.

## Essential Commands

### Development

```bash
npm start              # Start webpack dev server on port 8080
npm run build         # Build for development
npm run build-prod    # Build for production (minified)
```

### Testing

```bash
npm test              # Run unit tests with coverage
npm run e2e           # Run Cypress E2E tests headless
npm run e2e-open      # Run Cypress E2E tests interactively
npm run test:unit -- --grep "specific test"  # Run specific unit test
```

### Code Quality

```bash
npm run lint          # Run TSLint checks
npm run lint:fix      # Auto-fix linting issues
```

### SignageOS Integration

```bash
npm run upload-applet # Upload to signageOS platform
```

## Architecture Overview

### Core Components

1. **SmilPlayer** (`src/components/smilPlayer.ts`): Main player class that orchestrates all functionality
    - Handles initialization, playlist loading, and playback control
    - Integrates with signageOS SDK
    - Manages sync functionality for multi-display setups

2. **Playlist Processing** (`src/components/playlist/`):
    - `playlistProcessor/`: Core playlist parsing and scheduling logic
    - `playlistTriggers/`: Interactive trigger handling (keyboard, mouse, sensors)
    - `tools/`: Utilities for wallclock conditions, playlist extraction, etc.

3. **File Management** (`src/components/files/`):
    - Different fetching strategies for online/offline operation
    - Content validation and download management
    - Backup/failover content handling

4. **XML Parser** (`src/components/xmlParser/`): SMIL XML parsing with custom validators

### Key Design Patterns

- **Event-driven architecture**: Uses EventEmitter for component communication
- **Strategy pattern**: Different file fetching strategies based on environment
- **Async/await**: Extensive use of promises for file operations and API calls
- **TypeScript strict mode**: All code must pass strict type checking

### Important Configuration

The player is configured through signageOS timing settings:

- `smilUrl` (required): URL of the SMIL playlist
- `syncGroupName/syncGroupIds`: Multi-display synchronization
- `backupImageUrl`: Failover content
- `serialPortDevice`: Sensor integration path
- `debugEnabled`: Enable debug logging

### Testing Approach

- **Unit tests**: Mocha + Chai, focus on individual component logic
- **E2E tests**: Cypress, test complete playback scenarios
- Test files use `.spec.ts` suffix
- Mock SMIL files in `cypress/testFiles/`

### Development Notes

1. The player runs as a signageOS applet with UID: `ae831411425df581cae9d74c2a8c04386166d0cbb70ef377f2`
2. Local development uses webpack-dev-server with CORS proxy
3. Target ES5 for maximum browser compatibility
4. Debug logs use the `debug` package - set `localStorage.debug = '*'` to enable
5. Sync functionality requires Redis server for multi-display coordination

## Sync Migration Standard Approach

When working on sync migration steps, always follow this methodology:
- Work like a Senior Software Engineer
- Focus on simplicity and minimal necessary changes  
- Only modify code required for migration
- Don't touch unrelated repository code
- Reference sync-noWait.md and sync-refactor.md for guidance
- Ask if unsure how to proceed
- Keep responses short
- Create git commit after completing each step
