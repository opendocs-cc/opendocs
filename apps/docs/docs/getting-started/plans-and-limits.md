---
title: Plans and limits
description: What Free, Pro and Team include, the 50-document cap on Free, how Team seats are counted, and the rate limits on every plan.
---

# Plans and limits

The agent workflow, the CLI and the REST API work the same on every plan. Plans
differ in how much you can keep, how many people and workspaces you have, and
whether exports carry your brand. Prices are on
[opendocs.cc/pricing](https://opendocs.cc/pricing).

## Plans

| | Free | Pro | Team |
| --- | --- | --- | --- |
| Price | $0 | $8/month or $72/year | $4 per member/month, or $3 billed yearly. 3-seat minimum |
| Published documents | 50 per workspace | Unlimited | Unlimited |
| Workspaces you own | 1 | 2, more as add-ons | Unlimited |
| Members per workspace | 3 | 5 | Unlimited |
| PDF export | Yes, with a "Made with OpenDocs" footer | Yes | Yes |
| Word (.docx) export | No | Yes | Yes |
| Export branding (presets, color, font, logo) | Yes | Yes | Yes |
| Your own export footer, or none | No | Yes | Yes |
| Google Drive and e-signatures | No | Yes | Yes |
| Custom domain | No | 1 per workspace | 1 per workspace |
| Sharing, public documents, version history | Yes | Yes | Yes |
| API keys, CLI and agent skill | Yes | Yes | Yes |
| Support | Community | Email | Priority |

Paid features follow the workspace: Word export, the export footer, integrations and the
[custom domain](../publishing/custom-domains.md) work in a workspace whose owner is on Pro
or Team, for every member of it.

## The 50-document cap on Free

The cap counts **published** documents in a workspace. These don't count:

- **Updates.** A new version of an existing document doesn't use a slot.
- **Unpublished documents.** Unpublishing frees a slot right away.
- **Files you haven't published.** Markdown on your machine isn't counted.

When the cap is reached, existing documents stay up and keep working, updates
included. New publishes are refused until you unpublish something or upgrade.

> **Ask your agent**
>
> "How many documents do I have left on the Free plan?"
>
> "Unpublish the drafts from last month to free up some room."

### Under the hood

`opendocs whoami --json` and `GET /api/v1/me` return the live count for the
active workspace:

```json
{
  "quota": {
    "documents": { "plan": "free", "limit": 50, "used": 47, "remaining": 3 }
  }
}
```

On Pro and Team, `limit` and `remaining` are `null`, meaning unlimited.

Over the cap, both `POST /api/v1/publish` and `POST /api/v1/publish/batch` answer
`403 document_limit`. A batch is checked before anything is written: if it doesn't
fit, nothing is published. The CLI runs the same check before uploading.

```json
{
  "error": "document_limit",
  "plan": "free",
  "limit": 50,
  "used": 50,
  "message": "Your free plan allows 50 published documents. You currently have 50."
}
```

A batch error also carries `requested` and `workspaceId`. See
[Errors](../errors.md).

## Workspaces and members

- **Workspaces you own** are counted against your plan. Pro includes 2; the owner
  can add more from **Billing** in the dashboard. Team has no limit.
- **Members** are capped per workspace on Free (3) and Pro (5), counting pending
  invitations. Team has no cap.
- **Roles** work on every plan. Every workspace has an owner, and members can be
  made admins. Members can read and edit every document that isn't private.
  Managing a document (its visibility, sharing, moving, unpublishing or deleting)
  is for its author and the workspace's owners and admins, who also manage people
  and settings. See [Workspaces and teams](../visibility/workspaces-and-team-access.md).

## How Team billing works

- Team is billed to the account that buys it, so only the workspace owner can buy
  or change the plan.
- Seats follow confirmed membership: a seat is added when someone accepts an
  invitation and released when they're removed or leave, with a minimum of 3.
  Changes are prorated.
- One person counts once, however many of your workspaces they're in.

## Downgrading and canceling

Cancel any time from **Billing**. Paid features stay until the end of the billing
period, then the account is on Free. Every document stays published and readable.
On Free you can't publish new documents beyond the cap, and new exports end with
the "Made with OpenDocs" footer. Your logo, brand color and font stay; your own
footer is kept and applies again if you upgrade. A custom domain is paused: its
links redirect to opendocs.cc until you upgrade again.

## Rate limits

The same on every plan, per account for signed-in requests and per IP otherwise,
per minute:

| What | Limit |
| --- | --- |
| All API traffic (per IP) | 600 requests |
| Publish | 120 requests |
| Batch publish (up to 25 documents each) | 20 requests |
| Export | 120 requests |
| Batch export (up to 10 documents each) | 30 requests |
| Exports running at the same time | 4 |
| Anonymous publish (per IP, per hour; 50 a day) | 20 |

They're sized so an agent can republish and re-export a folder of 50 long
documents in one run. Over a limit, the API answers `429 rate_limited` with a
`Retry-After` header, and the CLI (0.4.6 or later) waits and retries on its own.

## Which plan

- **Trying it with your agent, or a handful of documents:** Free.
- **Client-facing PDFs without the OpenDocs footer, Word files, more than 50
  documents, your own domain, Drive or e-signatures:** Pro.
- **A team that shares workspaces:** Team.
