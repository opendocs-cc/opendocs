---
title: Custom domains
description: Serve a workspace's documents on your own domain, such as notes.example.com, on Pro and Team. The DNS records to add, what readers see, private documents and sign-in, and troubleshooting.
---

# Custom domains

On Pro and Team, a workspace can serve its documents on a domain you own:
`notes.halvard.example/q3-plan` instead of `opendocs.cc/halvard/q3-plan`. The
workspace page, projects, tag pages and documents all move there, over HTTPS,
and the opendocs.cc links keep working by redirecting to the new address.

> **Ask your agent**
>
> "Give me the link to the Q3 plan." (Agents use the custom-domain link once
> it's active.)
>
> "Publish the changelog publicly and link it from the README."

## What you need

- **A Pro or Team workspace.** What counts is the workspace's plan: the owner's
  Pro or Team plan, or Founder or Creator access, which count as Pro and Team.
  On Free, the setting shows a Pro badge.
- **A subdomain you can add DNS records to,** such as `notes.halvard.example`
  or `docs.halvard.example`. One per workspace. Root domains
  (`halvard.example`) aren't supported: the connection is a CNAME record, which
  root domains can't have at most providers.
- **The owner or an admin** sets it up. Members can see the domain and its
  status but not change it.

## Set it up

1. In the dashboard, open **Workspace settings** and find **Custom domain**.
2. Enter the domain, for example `notes.halvard.example`, and save. Paste a full
   URL if you like; OpenDocs keeps only the domain.
3. Add the two records the card shows at your DNS provider. Each has a copy
   button.

   | Type | Name | Value |
   | --- | --- | --- |
   | CNAME | `notes.halvard.example` | `custom.opendocs.cc` |
   | TXT | `_opendocs.notes.halvard.example` | `opendocs-verify=<your token>` |

   The CNAME sends readers to OpenDocs. The TXT record proves the domain is
   yours; the token is different for every workspace and domain. **Keep both
   records** once the domain is active: OpenDocs checks them every 6 hours,
   and a domain whose records fail three checks in a row stops serving.
4. Wait for the status to turn **Active**, or click **Check now**. DNS changes
   usually show up within minutes, sometimes a few hours.
5. Click **Visit**. The first visit sets up the HTTPS certificate, which takes a
   few seconds.

Not sure where your DNS is managed, or how to add records? While the domain
waits for DNS, the card has **Copy prompt for your agent**: a prompt with your
domain's records that you paste into Claude, ChatGPT or another agent. It finds
your DNS provider and adds the records for you, or walks you through it.

Saving the same domain again keeps its token, so the records stay valid.
Entering a different domain replaces the old one, with a new token.

### Names at your DNS provider

Some providers want the full name (`notes.halvard.example`), others only the
part before your domain (`notes`, and `_opendocs.notes` for the TXT record).
The card shows both. If a provider adds your domain to whatever you type,
entering the full name gives you `notes.halvard.example.halvard.example`, and
the check fails with "No CNAME record found".

- **Cloudflare:** DNS, then Records, then Add record. Set **Proxy status** to
  **DNS only** (the grey cloud) on the CNAME. With the orange cloud, Cloudflare
  answers for the domain instead of OpenDocs, the certificate can't be issued,
  and the check says the domain is proxied by Cloudflare. Use `notes` and
  `_opendocs.notes` as the names.
- **GoDaddy:** your domain's DNS page, then Add New Record. Names are relative:
  `notes` and `_opendocs.notes`.
- **Namecheap:** Domain List, Manage, then Advanced DNS. Add a CNAME Record and
  a TXT Record with the hosts `notes` and `_opendocs.notes`.
- **ISNIC (.is domains):** add the records wherever the domain's name servers
  are. If they're ISNIC's DNS service, that's ISNIC's zone editor; if your .is
  domain uses another provider's name servers, add them there.
- **Anywhere else** (Route 53, Google Cloud DNS, your hosting company): the
  same two records. A trailing dot on the value (`custom.opendocs.cc.`) is fine.

## Status

| Status | What it means |
| --- | --- |
| **Waiting for DNS** | The records aren't there yet, or not as shown. The card says which one. |
| **Verifying** | The records check out. The HTTPS certificate is issued on the first visit, which takes a few seconds. |
| **Active** | Readers get your documents on the domain. |
| **Misconfigured** | The records were removed or changed, and the domain stopped serving. The card says which record and since when. |
| **Paused** | The workspace isn't on Pro or Team any more. Readers are sent to opendocs.cc until it is. |

OpenDocs re-checks every domain every 6 hours. If an active domain fails three
checks in a row, it stops serving, its status becomes **Misconfigured** and the
workspace owner gets an email. Fixing the records brings it back by itself at
the next check, or straight away with **Check now**. A failed **Check now** on
an active domain shows the problem but doesn't count toward the three, and
neither does a lookup that timed out.

## What readers see

| On the custom domain | Shows | Same as |
| --- | --- | --- |
| `/` | The workspace page | `opendocs.cc/halvard` |
| `/q3-plan` | A document in the Default project | `opendocs.cc/halvard/q3-plan` |
| `/projects/launch` | A project page | `opendocs.cc/halvard/projects/launch` |
| `/projects/launch/q3-plan` | A document in a project | `opendocs.cc/halvard/projects/launch/q3-plan` |
| `/tag/finance` | A tag page | `opendocs.cc/halvard/tag/finance` |
| `/projects/launch/tag/finance` | A project's tag page | `opendocs.cc/halvard/projects/launch/tag/finance` |

- **Your workspace's header, white-label if you like.** Pages show your logo
  and workspace name instead of the OpenDocs header. The only mention of
  OpenDocs is one "Published with OpenDocs" line in the footer, which you can
  turn off under **Show "Published with OpenDocs"** in the Custom domain card.
  Every link on the page (breadcrumbs, related documents, tags, search) stays
  on your domain.
- **One address per page.** On opendocs.cc, every page of the workspace
  redirects (308) to the same page on the custom domain, public or not, and
  canonical URLs, Open Graph and structured data name the custom domain, so
  search engines see one URL per document. (A document whose slug is an app
  path such as `login` or `dashboard` stays on opendocs.cc.)
- **Its own sitemap and robots.txt.** `/sitemap.xml` lists the workspace's
  public pages on your domain, and `/robots.txt` points to it. A workspace with
  no public documents gets a `robots.txt` that disallows everything and an
  empty sitemap. The opendocs.cc sitemap leaves the workspace out.
- **Downloads.** PDF, Word and Markdown downloads work on the domain, for public
  documents and for signed-in readers' private ones.
- **No tracking.** Custom domains load no OpenDocs analytics, no ad pixels and
  no cookie banner.
- **App pages stay on OpenDocs.** Paths such as `/dashboard`, `/login` and
  `/signup` go to opendocs.cc. A page that doesn't exist shows your workspace's
  "not found" page.
- **Slug changes are safe.** The domain belongs to the workspace, not its slug,
  so renaming the workspace's slug doesn't break it.

### Links from OpenDocs

Once the domain is active, OpenDocs hands out custom-domain links for every
published document, public or not: the dashboard (the workspace card,
**View** and **Copy link**), the CLI (0.4.9 and later), and the `publicUrl`
field in API responses (see [Under the hood](#under-the-hood)). Older CLI
versions and old links point to opendocs.cc, which redirects.

## Private documents and sign-in

Documents that aren't public (workspace-only, private, or shared with specific
people) work on the custom domain too, for people who may read them:

1. A reader opens `notes.halvard.example/board-minutes`.
2. The domain quietly checks with opendocs.cc whether they're signed in.
   Members of your workspace who already are come straight back signed in,
   without seeing a sign-in page. Everyone else is back a moment later on a
   "this page is private" page with a **Sign in** button: nobody is asked to
   sign in or sign up unless they choose to.
3. **Sign in** goes to opendocs.cc. Members of your workspace then come
   straight back. Anyone else, such as someone a document was shared with,
   clicks **Continue as their@email** first, because your workspace will see
   their name, email address and profile picture.
4. Someone signed in with an account that's neither a member nor has anything
   shared with it on your domain stops on opendocs.cc ("This account doesn't
   have access"), with **Use another account**. Your domain never learns who
   they are.
5. Back on the custom domain they're signed in on that domain only, and the
   document opens if they have access to it. Without access they see a
   "you don't have access" page, as on opendocs.cc.

- The sign-in lasts 7 days, and ends when they sign out of opendocs.cc.
  **Sign out** in the account menu on the custom domain signs them out of
  OpenDocs: on the domain and on opendocs.cc.
- On the custom domain readers can read, comment and download. Everything else
  (editing, settings) happens on opendocs.cc; **OpenDocs dashboard** in the
  account menu opens the dashboard on this workspace.
- The opendocs.cc sign-in never reaches your domain, and the custom-domain
  sign-in never reaches opendocs.cc or another custom domain.

## Downgrading and removing

- **Downgrade to Free:** the domain is kept but paused. Readers who open it are
  redirected (302) to the same page on opendocs.cc, and opendocs.cc stops
  redirecting to it. Upgrading again restores it, with nothing to set up.
- **Remove the domain:** **Remove** in the card, after a confirmation.
  opendocs.cc stops redirecting at once and serves the workspace as before,
  links point to opendocs.cc again, and sign-ins on the domain end. The domain
  itself stops serving within a minute. You can delete the DNS records
  afterwards.
- **Deleted the DNS records first?** The next check (within 6 hours, or **Check
  now**) notices the CNAME is gone, and from then on opendocs.cc serves the
  workspace again instead of redirecting to the domain. Remove the domain in the
  card to finish; otherwise it turns **Misconfigured** after three checks and
  the owner gets an email.

## Under the hood

The dashboard card uses these endpoints. They accept a session or an API key
(`Authorization: Bearer od_live_...`), so agents and scripts can manage the
domain too.

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /api/v1/workspace/domain?workspaceId=` | Members | The domain, its status, the records to add and the last error |
| `PUT /api/v1/workspace/domain` | Owners and admins, Pro or Team | Connect or replace the domain. Body: `{ "workspaceId", "hostname" }` |
| `POST /api/v1/workspace/domain/check` | Owners and admins | Check the records now. Body: `{ "workspaceId" }`. 12 a minute |
| `PATCH /api/v1/workspace/domain` | Owners and admins, Pro or Team | Settings. Body: `{ "workspaceId", "showPoweredBy": false }` hides "Published with OpenDocs" |
| `DELETE /api/v1/workspace/domain?workspaceId=` | Owners and admins | Remove the domain |

```bash
curl https://api.opendocs.cc/api/v1/workspace/domain \
  -X PUT \
  -H "Authorization: Bearer od_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "workspaceId": "ws_123", "hostname": "notes.halvard.example" }'
```

The response describes the domain, with `state` as the dashboard shows it
(`pending`, `verifying`, `active`, `misconfigured` or `paused`). The full shape
is in the [Workspaces API](/api-reference/workspaces#custom-domain).

Errors follow the usual `{ "error", "message", "docs_url" }` shape:
`plan_required` on Free, `invalid_hostname` for a name OpenDocs can't serve,
`domain_taken` when another workspace has the domain active, and `forbidden`
for members. See [Error codes](/errors).

### `publicUrl`

Every API response that returns a document's `url` (publish, batch publish,
update, get, list, move, visibility, claim) also returns `publicUrl`, the
absolute link to share. It's the custom-domain URL when the domain is active
and the document is published (whatever its visibility), and the opendocs.cc
URL otherwise:

```json
{
  "url": "/halvard/q3-plan",
  "publicUrl": "https://notes.halvard.example/q3-plan"
}
```

Share `publicUrl`, and use it when one document links to another, so readers
stay on your domain.

## Troubleshooting

- **"No TXT record found at _opendocs..."** The TXT record is missing or under
  another name. Check the name doesn't end in your domain twice (see
  [Names at your DNS provider](#names-at-your-dns-provider)).
- **"The TXT record ... has a different verification value."** It's from an
  earlier attempt. Replace the value with the one in the card.
- **"... points to ..., not custom.opendocs.cc."** The CNAME points somewhere
  else, or the name has A records instead. Change it to a CNAME to
  `custom.opendocs.cc`, and remove any A or AAAA records for the name.
- **"Use a subdomain such as notes.halvard.example."** Root domains aren't
  supported. Connect a subdomain instead.
- **"... is proxied by Cloudflare."** Turn the record's proxy off (grey cloud,
  DNS only).
- **Still waiting after you added everything.** DNS changes can take a while to
  spread, longer if the record existed before with a long TTL. Click **Check
  now** later; OpenDocs also checks every 6 hours on its own.
- **"... is connected to another OpenDocs workspace."** Remove it there first.
  If the other workspace is no longer yours to change, replace its
  `opendocs-verify` TXT value with yours; once its checks fail, the domain can
  be connected here. While another workspace's value is still in the TXT
  record, the check says so.
- **The first visit shows a certificate warning or takes a moment.** The
  certificate is issued on the first visit after the domain turns active. Wait
  a few seconds and reload.
- **"This domain isn't connected to OpenDocs."** The domain points to OpenDocs
  but isn't active for any workspace: it's still waiting for its TXT record,
  it's misconfigured, or it was removed.

## Related pages

- [Public documents](../visibility/public-sharing.md)
- [Workspaces and teams](../visibility/workspaces-and-team-access.md)
- [Plans and limits](../getting-started/plans-and-limits.md)
- [Workspaces API](/api-reference/workspaces#custom-domain)
