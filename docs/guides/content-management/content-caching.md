---
sidebar_position: 4
---

# Content Caching

signageOS SMIL Player automatically caches SMIL files, all media, and widgets into the internal memory of the device to
allow playback in case there is no network connection.

## How are media handled after a device reboot? Are they re-downloaded?

The content is stored in persistent storage on the device. The SMIL Player downloads files only once (in the first SMIL
file load), then all media files and widgets are stored and available even after the device reboot.

Note: the media cache is keyed to the SMIL URL. If the configured `smilUrl` changes, the cache is invalidated and all
media is re-checked/re-downloaded from scratch.

## What happens if some content is not played anymore (SMIL changed)? Is it deleted from disk immediately?

If any media files or widgets are no longer needed they are deleted once:

- the SMIL Player reboots
- the SMIL file changes
- a new SMIL file is added
- the current SMIL file gets some media/content updated

Before deletion, recently replaced content is first moved into an internal preservation area (up to 20 files per media
type, oldest evicted first). If the same content URL later reappears in the playlist, the file is restored from there
instead of being re-downloaded.

## Is there an automatic file/cache-cleanup implemented in the device?

Any changes implemented in the SMIL file or when the new content is added, all files which are no longer needed are
removed.

## Storage limits

The player enforces a minimum free-space floor of **100 MB** (plus a 10% safety margin) on every download and internal
copy. When an operation would drop free space below the floor, it is skipped and the element keeps its previous content
(or plays nothing if it was never downloaded). If content unexpectedly fails to update on a device, check the free
storage first.

## Controlling updates

Update detection, per-element overrides, and HTTP-status-driven skip/refresh rules are covered in
[Updating Content](updating-content.md), with full attribute semantics in the
[`<meta>` Attribute Reference](../../reference/meta-attributes.md) and the
[Element Attribute Reference](../../reference/element-attributes.md).

## URLs with Query Parameters

The SMIL Player treats URLs with different query parameters as separate files for caching purposes. This means that each unique combination of URL and query parameters will be cached independently.

### How it works

When the SMIL Player encounters URLs with query parameters, it includes those parameters in the cache file naming. This ensures that:
- Different content variations can be served using the same base URL
- Each variation is cached separately
- Query parameters can be used for tracking, versioning, or dynamic content selection

### Important Note on XML Encoding

When using query parameters in SMIL files, remember to properly XML-encode the ampersand character:
- Use `&amp;` instead of `&` between query parameters

### Example Usage

```xml
<!-- These URLs will be cached as separate files -->
<video src="https://example.com/content?adunit=ABC123&amp;id=1" region="main"></video>
<video src="https://example.com/content?adunit=ABC123&amp;id=2" region="main"></video>

<!-- Using query parameters for versioning -->
<img src="https://example.com/banner.jpg?version=2.1&amp;campaign=summer" dur="5s" region="main"></img>

<!-- Dynamic content based on parameters -->
<ref src="https://example.com/widget?location=NYC&amp;lang=en" type="text/html" dur="10s" region="main"></ref>
```

### Common Use Cases

1. **Content Variations**: Serve different content using the same base URL with different parameters
2. **Analytics Tracking**: Add tracking parameters to monitor content performance
3. **A/B Testing**: Use parameters to serve different versions for testing
4. **Dynamic Content**: Pass contextual information through query parameters

## `<prefetch>` (legacy compatibility)

> The section below is to maintain compatibility with the legacy SMIL systems.

**signageOS SMIL Player automatically caches** all files referenced by playable elements in the SMIL playlist
(`<video>`, `<img>`, `<ref>`, `<audio>`) into internal memory and deletes old files which are no longer needed. You do
not have to — and cannot — prefetch files via the `prefetch` tag.

The `<prefetch>` tag itself is accepted for compatibility with legacy SMIL playlists but is **ignored**: a file
referenced *only* by a `<prefetch>` tag is never downloaded. All caching is driven by the playable elements in the
playlist.

The related legacy pattern that **is** supported is the intro/preloader gate: a `<seq end="__prefetchEnd.endEvent">`
block plays a loader until all playlist media has been downloaded, after which the main
`<par begin="__prefetchEnd.endEvent">` content starts. See the
[Hello World tutorial](../../getting-started/hello-world-playlist.md) for a complete example.

```xml
<par>
    <!-- Preloader: plays until all media referenced by the playlist is cached -->
    <seq end="__prefetchEnd.endEvent">
        <seq repeatCount="indefinite">
            <video src="https://demo.signageos.io/smil/zones/files/loader.mp4"/>
        </seq>
    </seq>

    <!-- Main content: starts once caching completes -->
    <par begin="__prefetchEnd.endEvent" repeatCount="indefinite">
        ....
    </par>
</par>
```
