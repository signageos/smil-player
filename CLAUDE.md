# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript SMIL (Synchronized Multimedia Integration Language) player for signageOS digital signage devices. Parses SMIL XML playlists and orchestrates playback of videos, images, widgets, and tickers across multiple display regions, with optional multi-device synchronization.

## Common Commands

### Build
```bash
npm run build              # Development build (webpack)
npm run build-prod         # Production build (needs NODE_OPTIONS='--openssl-legacy-provider')
npm run clean-build        # Full rebuild + ES5 compatibility check
```

### Test
```bash
npm test                           # Unit tests (Mocha+Chai+nyc, 20% coverage threshold)
npx mocha -- "test/unit/tools/files.spec.ts" --require ts-node/register -P tsconfig.json  # Single unit test
npm run test:headless              # Playwright e2e tests (headless)
npm run test:headed                # Playwright e2e tests (visible browser)
npx playwright test test-runner/zones.test.ts  # Single e2e test
```

### Lint
```bash
npm run lint               # TSLint + docs validation
npm run lint:fix           # Auto-fix
```

### Development
```bash
npm run start              # webpack-dev-server on port 8090
npm run start-emulator     # Emulator mode (port 8090, no hot reload)
```

## Architecture

### Main Flow
`SmilPlayer.start()` → fetches SMIL XML → `XmlParser` converts XML to JSON → `FilesManager` downloads/caches media → `PlaylistDataPrepare.getAllInfo()` extracts regions, transitions, media info → `PlaylistProcessor.processPlaylist()` runs the main playback loop → `PlaylistTraverser` recursively walks playlist elements → `SMILElementController` manages individual element lifecycle (play/pause/visibility).

### Key Components (`src/components/`)
- **smilPlayer.ts** — Entry point, orchestrates the full lifecycle
- **playlist/playlistProcessor/** — Core playback engine (playlistProcessor, playlistTraverser, SMILElementController)
- **playlist/playlistDataPrepare/** — Pre-processes SMIL into internal structures
- **playlist/playlistCommon/** — Base class with shared playlist utilities
- **playlist/playlistTriggers/** — Keyboard/mouse/sensor trigger handling
- **playlist/playlistPriority/** — Priority-based content override
- **playlist/tools/** — Utility modules (generalTools, conditionalTools, wallclockTools, syncTools, scheduleTools, htmlTools, tickerTools, SyncGroup, etc.)
- **files/filesManager.ts** — Download, cache, and storage management
- **files/fetchingStrategies/** — Pluggable download strategies
- **xmlParser/** — XML-to-JSON conversion and region/transition extraction

### Rendering Split
Videos render on the **main page** via `sos.video.play()`. Images, widgets, and tickers render **inside an iframe** (port 8091 in emulator, different origin). This is important for element selectors in tests.

### Synchronization
Multi-device sync uses an ACK-based protocol managed by `SyncGroup.ts` and `syncTools.ts`. Devices elect a master; slaves follow the master's playlist index. Sync operates at region level and trigger level.

### Models & Enums
- `src/models/` — TypeScript interfaces (PlaylistElement, SMILVideo, SMILImage, SMILWidget, PlaylistOptions, ISos, etc.)
- `src/enums/` — Constants (SMILScheduleEnum with magic values like neverPlay/defaultAwait, media types, conditionals, etc.)

### Shared State
`PlaylistOptions` is the central mutable state object threaded through the playlist system — holds cancellation flags, currently playing info, promise tracking, sync state, video preparation state, and random playlist state.

## Code Style

- **Formatter:** Prettier — tabs, 120 char width, single quotes, trailing commas, semicolons
- **Linter:** TSLint with `@signageos/codestyle` rules
- **TypeScript:** ES5 target, strict null checks, no implicit any, CommonJS modules
- **Build output must be ES5 compatible** (verified by `es-check`)

## Testing Strategy

**Unit tests** (`test/unit/`) — Mocha + Chai (`expect` style), MockDate for time-dependent tests. Focus on **pure utility functions** in `tools/` directories (conditionalTools, scheduleTools, wallclockTools, files/tools, generalTools). Core components like playlistProcessor and filesManager are too tightly coupled to browser/SOS APIs for meaningful unit testing.

**E2E tests** (`test-runner/`) — Playwright. Automatically starts webpack-dev-server (port 8090) and a local Express test server (port 3000). Viewport is 1080x1920 (portrait). Timeout is 180s.

**E2E test patterns:**
- Inject SMIL URL via `context.addInitScript()` + `window.__SMIL_URL__` (avoids cross-origin issues)
- Videos on main page: `page.locator('video[src*="..."]')`
- Images in iframe: `frame.locator('img[src*="..."]')`
- Widgets in iframe: `frame.locator('iframe[src*="..."]')`
- Do NOT use `--disable-web-security` (causes iframe restart loops)

## Runtime Review (for Claude)

After making code changes, verify them at runtime using the review script:

```bash
# Prerequisites: both servers must be running
npm start                        # Dev server on port 8090 (in separate terminal)
npm run start-e2e-server         # Test server on port 3000 (in separate terminal)

# Run review with a SMIL file
node tools/review-player.mjs --smil-url=http://localhost:3000/zonesCypress.smil --wait=20

# Shorter wait for simple tests
node tools/review-player.mjs --smil-url=http://localhost:3000/correctOrder.smil --wait=15
```

The script outputs JSON with DOM state (videos, images, widgets with visibility and coordinates) and saves a screenshot to `/tmp/smil-review.png`. Read the screenshot with the Read tool for visual verification.

For interactive browser exploration, the Playwright MCP server is configured in `.mcp.json` (requires Claude Code restart to activate). It provides `browser_navigate`, `browser_screenshot`, `browser_evaluate`, and `browser_console_messages` tools.

Available test SMIL files are listed in `cypress/enums/enums.ts` (all served from `http://localhost:3000/`).

## File Naming
Downloaded media files use deterministic checksum-based names (`filename_<hash>.ext`) — see `src/components/files/tools/index.ts:getFileName`.

## Coordinate System
SMIL root-layout defines logical dimensions (e.g., 1920x1080). `bottom=0` resolves relative to **viewport height**, not SMIL root-layout height.
