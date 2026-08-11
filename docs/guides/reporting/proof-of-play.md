---
sidebar_position: 2
---

# Proof of Play

Proof-of-play (PoP) reporting lets you track what's happening with your content — what played, when, and how — for
usage tracking and billing purposes. It's the `type="manual"` half of the reporting switchboard; see
[Setting Up Reporting](setup.md) for enabling it (alone or alongside `standard` events) and for routing reports to a
custom endpoint instead of the native signageOS pipeline.

## Tagging content

Tag any media element with `pop*` attributes to have its identifying info included in every report generated for
it — see [Proof of play](../../reference/element-attributes.md#proof-of-play) in the Element Attribute Reference
for what each attribute does and its default:

```xml
<img src="srcToElement"
     dur="15s"
     region="region"
     popType="video"
     popCustomId="customId"
     popFileName="First video"
     popTags="tag1,tag2,tag3"/>
```

Use [`popCustomId`](../../reference/element-attributes.md#popcustomid) or
[`popFileName`](../../reference/element-attributes.md#popfilename) to identify individual media items in reports —
[`popName`](../../reference/element-attributes.md#popname) is not one of the fields carried in the payload.

## Retrieving reports

Native PoP reports are delivered through the signageOS proof-of-play pipeline and retrieved via the signageOS
reporting APIs / Box. (The `/v1/device/{{deviceUid}}/applet/{{appletUid}}/command` endpoint retrieves
[standard event reports](../../reference/reporting-payloads.md#standard-events), not PoP reports.)

If a custom endpoint is configured (see [Setting Up Reporting](setup.md)), PoP reports are POSTed there instead —
see [Custom endpoint payloads](../../reference/reporting-payloads.md#custom-endpoint-payloads) for that shape.
Otherwise they use the native signageOS PoP payload — see
[Native proof-of-play payloads](../../reference/reporting-payloads.md#native-proof-of-play-payloads).

## See also

- [Setting Up Reporting](setup.md) — enabling reporting and choosing a transport
- [Reporting Events & Payloads](../../reference/reporting-payloads.md) — full payload shapes
