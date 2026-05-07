# Revel-only patches — carry forward on every signageos upgrade

This file tracks Revel-authored customizations that need to be preserved when merging new upstream releases of `signageos/smil-player`. Refer to it during every upgrade.

## Active patches

### 1. Custom loading images / "OneRevel" branding — origin commit `fa77bc5`
- File: `public/index.html`, plus assets under `public/`
- Purpose: replace signageos's default loading screen with Revel-branded images and set page title to "OneRevel"
- Verify after upgrade: load the player; Revel loading image and "OneRevel" title appear on startup

### 2. LG restart-on-reboot — origin commit `26adb38`
- File: `src/components/playlist/tools/syncTools.ts`
- Purpose: in `connectSyncSafe()`, when sync connection ultimately fails, restart the app on **LG** webOS devices (upstream restarts on Samsung)
- The line to preserve: `if ((await sos.management.getBrand()).toLowerCase().indexOf('lg') > -1)`
- Note: the **"force SyncServer"** half of this same commit was intentionally **dropped** during the 3.2.11 upgrade in favor of upstream's URL-configurable sync logic with P2PLocal fallback. If LG devices need to be forced onto SyncServer regardless of `syncServerUrl` config, revisit this decision.
- Verify after upgrade: deploy to an LG webOS device; force a sync failure; confirm app restarts.

## Dropped patches (do NOT carry forward)

- `72f4d93` — `expr` attribute validation in `getNextElementToPlay`. Use upstream behavior. This patch added an import of `checkConditionalExprSafe` and a `validParts` filter; both are removed.
- The "force SyncServer" half of `26adb38` (see note above).

## Evaluate separately

- `3e8dfd6` viewport offset — currently lives only on branch `revel/offset-debug` (mirrored on `myfork`). Not in production master. Re-evaluate before merging anywhere.

## Known environment issue

The upstream `.npmrc` shipped in 3.2.11+ gates package access in a way that breaks `npm install` outside Revel's gated registry. Working procedure for every upgrade:

```
rm -f package-lock.json .npmrc
npm install
```

Do **not** commit `.npmrc` back. The regenerated `package-lock.json` is what should be committed.

## Standard upgrade procedure

1. Tag current master: `git tag -a v<old> -m "Snapshot before <new> upgrade" && git push origin v<old>`
2. Ensure `upstream` remote is configured: `git remote -v` should list `upstream  https://github.com/signageos/smil-player.git`
3. `git fetch upstream --tags`
4. `git checkout master && git checkout -b upgrade/<new>`
5. `git merge <new>` (note: upstream tags are unprefixed, e.g. `3.2.11`, not `v3.2.11`)
6. Resolve conflicts per the rules in this file. Preserve all "Active patches"; drop any "Dropped patches" if they re-appear.
7. Apply the known environment issue workaround: `rm -f package-lock.json .npmrc`
8. `npm install && npm run build && npm test`
9. Run verification checks for every active patch above
10. `git add -A && git commit && git tag -a v<new> -m "Release <new>"`
11. Merge to master only after end-to-end verification: `git checkout master && git merge --no-ff upgrade/<new> && git push origin master v<old> v<new>`
