---
title: E-signatures with DocuSeal
description: Ask your agent to send an OpenDocs document for e-signature through your DocuSeal account. It drafts first and sends nothing until you confirm; the signed PDF and audit log come back to OpenDocs and can be filed in Google Drive. Pro and Team.
---

# E-signatures with DocuSeal

Connect your workspace's DocuSeal account and your agent can send any document for
signing: contracts, offer letters, board resolutions, policy sign-offs. DocuSeal
emails the signers; the signed PDF and its audit log come back to OpenDocs, and can
be filed in [Google Drive](./google-drive.md). Your agent always prepares a draft
first, and nothing reaches a signer until you confirm it.

> **Ask your agent**
>
> "Send the consulting agreement to John Adams, adams@company.example, for signing."
>
> "Send the board resolution to Dana (dana@halvard.example) and Sam (sam@halvard.example) at the same time, and file the signed copy in Signed Agreements."
>
> "Has John signed the consulting agreement yet?"

E-signatures are part of the Pro and Team plans. On Free, agents get
`plan_required`.

## What you need

- A workspace on Pro or Team. See [Plans and limits](../getting-started/plans-and-limits.md).
- Your own DocuSeal account with API access, on docuseal.com, docuseal.eu or a
  self-hosted instance. DocuSeal's API needs a DocuSeal Pro plan, and DocuSeal
  bills each document sent through it. Signers get their emails from DocuSeal.
- An owner or admin of the workspace to connect it, once, in the dashboard.

## Connect DocuSeal

1. In the [dashboard](https://opendocs.cc/dashboard), open **Integrations** (under
   **Workspace** in the sidebar).
2. Under **DocuSeal**, pick the **Account region**: **docuseal.com**,
   **docuseal.eu**, or **Self-hosted**. For self-hosted, enter your
   **Instance address** (`https://sign.halvard.example`, for example).
3. Paste your **API key**. On docuseal.com it's at
   [console.docuseal.com/api](https://console.docuseal.com/api); on docuseal.eu at
   [console.docuseal.eu/api](https://console.docuseal.eu/api); self-hosted, in your
   instance's settings under API.
4. Click **Connect DocuSeal**. OpenDocs checks the key with DocuSeal before saving
   it, and stores it encrypted. The card then says **Connected**, with the account
   and region.

### Add the webhook (recommended)

Once connected, the card shows a webhook address. With it, OpenDocs hears about
each signature as it happens, and files signed copies as soon as the last person
signs.

1. Copy the webhook URL from the DocuSeal card.
2. In DocuSeal, open **Webhooks**, add the URL, and select the form and submission
   events.
3. Copy the webhook's signing secret (it starts with `whsec_`) from DocuSeal, paste
   it into the field under the URL in OpenDocs, and click **Save**.

Without the webhook, OpenDocs checks DocuSeal when someone looks at a request
(your agent checking the status, or opening the request in the dashboard).

A webhook only prompts OpenDocs to check: the status always comes from DocuSeal's
API, so a forged webhook can't mark anything signed. The URL contains a secret
token; keep it private. If you disconnect DocuSeal and connect it again, the URL
changes, so update it in DocuSeal.

## Mark where people sign

Add a `signature` block where the signatures go, usually at the end of the
document. Each entry is one person:

````md
```signature
- role: Consultant
  name: John Adams
  title: Principal, Adams Advisory
- role: Halvard
  name: Dana
  title: Chief Operating Officer
```
````

On the web and in PDF and Word exports, each entry is drawn as a signature box: a
line to sign on, the name (or the role, if there's no name), the title, the role
(when there's a name), and a date line. When the document is sent for signing,
DocuSeal puts a signature field and a date field in each box, and fills in the date
when that person signs. Normal exports don't carry those fields.

The rules:

- The fence's info string is `signature` and nothing else (any case). Three or more
  backticks or tildes both work.
- Each entry starts with `- `. The keys are `role` (required), `name` and `title`
  (optional); keys are case-insensitive, other keys are ignored, and values can be
  quoted.
- Each `role` must be unique in the block (ignoring case), at most 60 characters,
  and can't contain `;`, `{`, `}` or `=`.
- A block that breaks these rules (a missing or repeated role, or text before the
  first `- `) is shown as an ordinary code block and isn't used for signing.
- A role that appears in more than one block is the same person signing in more
  than one place.
- No block? OpenDocs adds one at the end of the PDF it sends, one box per signer.
  Your published document isn't changed.

When the document has a block, every role in it needs exactly one signer. Your agent
matches each person you name to a role by the role or by the `name` in the block,
and asks you when it can't tell.

## What happens when you ask

1. **Your agent prepares a draft.** Nothing is emailed. OpenDocs renders the PDF
   exactly as signers will get it and records its SHA-256 fingerprint, so what you
   approve is byte for byte what's sent.
2. **Your agent shows you the draft:** the document and version, each signer's
   name, email and role in signing order, whether they sign one after another or
   all at once, the email subject and message, the expiry date, where the signed
   copy will be filed, and any warnings, such as an email address outside your
   workspace's email domains. It can give you the PDF to read first.
3. **You confirm**, in one of two ways, depending on the workspace setting:
   - **In chat** (the default): you say yes, and your agent sends it. "Looks fine"
     or silence doesn't count.
   - **In the browser**: your agent gives you a link to the request in OpenDocs.
     You check the document and every name and email, tick the box, and click
     **Send to 1 signer** (or however many). Agents can't send in this mode.
4. **DocuSeal emails the signers**: the first signer, or everyone at once.
5. **When everyone has signed**, the signed PDF and audit log are ready, and filed
   in Google Drive if you asked for that.

To change anything (a name, an email, the wording of the document), your agent
cancels the draft and makes a new one. A draft keeps the exact PDF it was made
from, so later edits to the document don't change it.

You can also review drafts yourself in either mode. The **Signature requests**
list on the Integrations page shows the latest 50 in the workspace; drafts are
marked **Waiting for confirmation**. Open one to read the PDF (**Open PDF**), then
send it or click **Discard draft**.

## Signing order

| Order | What signers get | Ask for it |
| --- | --- | --- |
| One after another (default) | Each signer is emailed after the previous one has signed, in the order you named them. | "John first, then Dana." |
| All at once | Everyone is emailed at the same time and can sign in any order. | "Send it to both at the same time." |

## Status, expiry and reminders

Ask your agent where a request stands ("Has John signed yet?"). It checks DocuSeal
and tells you who has signed.

| Request status | In the dashboard | Meaning |
| --- | --- | --- |
| `draft` | Waiting for confirmation | Prepared, not sent. |
| `pending` | Out for signature | Sent; waiting for at least one signer. |
| `completed` | Signed | Everyone has signed. |
| `declined` | Declined | A signer declined. Their reason is shown with their name. |
| `expired` | Expired | The expiry date passed before everyone signed. |
| `cancelled` | Cancelled | Cancelled in OpenDocs; signers can no longer open it. |

Each signer also has a status: not sent, waiting for earlier signers, email sent,
opened, signed (with the time), or declined.

If sending fails, the request stays a draft and shows why ("The last attempt to send
failed: …"). Fix the cause and confirm again.

- **Expiry:** ask for a date ("it should expire on November 30"). The request
  expires at the end of that day (UTC); the date must be at least an hour away.
  Without one, the request has no expiry date.
- **Reminders:** OpenDocs doesn't send reminder emails. If you want them, look at
  your DocuSeal account's settings.
- **Cancelling:** "Cancel the signature request for the consulting agreement."
  Your agent checks with you first. A request that was already sent is archived in
  DocuSeal, so signers can no longer open it. A completed request can't be
  cancelled.

## Signed PDF and audit log

> **Ask your agent**
>
> "Download the signed consulting agreement and its audit log."

When everyone has signed, your agent can download the signed PDF, with every
signature in it, and DocuSeal's audit log, the record of who signed and when. In the
dashboard, open the request and click **Signed PDF** or **Audit log**.

They're named after the document and version, like
`Consulting agreement (v2) – signed.pdf` and
`Consulting agreement (v2) – audit log.pdf`. OpenDocs fetches them from DocuSeal
each time; after sending, it keeps only the SHA-256 of the PDF that was sent, not
the file.

## File signed copies in Google Drive

With [Google Drive](./google-drive.md) connected, the signed PDF and the audit log
can go into one of your named Drive folders:

- **Automatically:** ask when you send ("…and file the signed copy in Signed
  Agreements"). Both files are saved there once everyone has signed: right away with
  the webhook, otherwise the next time someone checks the request.
- **Later:** "File the signed consulting agreement in Signed Agreements."

Both files are marked read-only in Drive ("Signed – final" and "Audit log –
final"), and the signed PDF's description records the SHA-256 of the original PDF
that was sent. Read-only in Drive is a signal, not an access control; for real
retention, set Google Vault rules on the shared drive.

## Who can use it

| Who | Can |
| --- | --- |
| Owners and admins | Connect and disconnect DocuSeal, set up the webhook, change the settings below. |
| Anyone who can use integrations | Request signatures, and see, send, cancel and download every signature request in the workspace. |

Two workspace settings, under **Settings** on the Integrations page:

- **Who can use integrations:** **Every member** (default) or **Owners and admins
  only**.
- **Confirming signature requests:** **In chat** (default: "Your agent shows the
  document, names and emails, and sends once you say yes") or **In the browser**
  ("Agents prepare requests; a person reviews and sends each one here in
  OpenDocs").

To send a document for signing, you also need to be able to read it, the same rule
as for exports.

## Under the hood

Signing is always two commands: `sign request` makes a draft, `sign send` sends it.
Agents never run them in the same step, and never pass `--yes` to `sign send`
without the user's explicit yes.

```bash
# 1. Draft. Nothing is emailed.
opendocs sign request consulting-agreement.md \
  --signer "Consultant=John Adams <adams@company.example>" \
  --signer "Halvard=Dana <dana@halvard.example>" \
  --subject "Please sign: consulting agreement" \
  --expires 2026-11-30 --file-to "Signed Agreements" --json

# Optional: the exact PDF signers will get (drafts only)
opendocs sign download <id> --kind draft

# 2. Send, after the user said yes to the summary
opendocs sign send <id> --yes --json

# Afterwards
opendocs sign status <id> --json
opendocs sign list --doc consulting-agreement.md --status pending --json
opendocs sign download <id>                      # signed PDF
opendocs sign download <id> --audit              # audit log
opendocs sign save <id> --folder "Signed Agreements" --json
opendocs sign cancel <id> --yes --json           # only when the user asks
```

Without `--json`, `sign request` prints the summary your agent reads back to you:

```text
✔ Draft signature request created. Nothing has been sent yet.

  Document: Consulting agreement (v2, SHA-256 3b9f0c2a71de)
  Request:  5b0e2c9a-7d14-4f3b-9a61-3c8e0d2f7b45
  Signers (sequential: each signer is emailed after the previous one has signed):
    1. John Adams <adams@company.example> — Signer 1
  Email:    the standard DocuSeal invitation (no custom subject or message)
  Expires:  no expiry date
  File to:  not filed automatically
  ⚠ adams@company.example is outside your workspace's email domains.

  Next step: Read these signers back to the user and get an explicit yes, then run:
    opendocs sign send 5b0e2c9a-7d14-4f3b-9a61-3c8e0d2f7b45 --yes
  Offer the user the exact PDF signers will get first: opendocs sign download 5b0e2c9a-7d14-4f3b-9a61-3c8e0d2f7b45 --kind draft
```

### `opendocs sign request <doc>`

`<doc>` is a post ID, a slug, or a local `.md` file this folder published.

| Flag | Default | Notes |
| --- | --- | --- |
| `--signer <signer>` | Required, repeatable | `"Name <email>"` or `"Role=Name <email>"`, one per signer, in signing order. 1 to 10 signers. A signer without a name or with a malformed email is refused before anything is sent to the server. |
| `--parallel` | Off | Email every signer at once. Without it, one after another. |
| `--subject <subject>` | DocuSeal's invitation | Email subject, up to 200 characters. |
| `--message <message>` | DocuSeal's invitation | Email message, up to 4,000 characters. A longer one is refused with `invalid_request`. |
| `--expires <date>` | No expiry | `YYYY-MM-DD`. Expires at the end of that day (UTC), at least an hour from now. |
| `--file-to <folder>` | Not filed | A Drive folder name from `opendocs integrations`. The signed PDF and audit log are saved there once everyone has signed. |
| `--version <n>` | Latest | Send an earlier version (`3` or `v3`). |

Without a signature block, signers without a role get `Signer 1`, `Signer 2`, and
so on. With one, see [Mark where people sign](#mark-where-people-sign).

### The other `sign` commands

| Command | Flags | Notes |
| --- | --- | --- |
| `opendocs sign send <id>` | `-y`, `--yes` | Sends a draft. `--yes` is required outside a terminal and with `--json`; in a terminal without it, the CLI shows the summary and asks. In browser mode it fails with `approval_required` and the `approveUrl`. |
| `opendocs sign status <id>` | | Refreshed from DocuSeal (at most every 30 seconds). |
| `opendocs sign list` (`ls`) | `--doc <doc>`, `--status <status>` | Newest first, up to 50. Shows the last known status without refreshing. `--status`: `draft`, `pending`, `completed`, `declined`, `expired`, `cancelled`, `failed`. |
| `opendocs sign cancel <id>` | `-y`, `--yes` | Cancels a draft or a pending request. `--yes` is required outside a terminal. |
| `opendocs sign download <id>` | `--kind <kind>` (default `signed`), `--draft`, `--audit`, `-o`, `--output <path>` | `--kind` is `signed`, `audit` or `draft`; `--draft` and `--audit` are shortcuts, use only one. The draft PDF exists only until the request is sent. Default output: the server's file name in the current folder. |
| `opendocs sign save <id>` | `--folder <name>` (required) | Saves the signed PDF and audit log of a completed request to a Drive folder. |

A signature request in JSON (from `sign request`, `send`, `status`, `cancel`, and
in `sign list` as `requests[]`):

```json
{
  "id": "5b0e2c9a-7d14-4f3b-9a61-3c8e0d2f7b45",
  "workspaceId": "…",
  "status": "draft",
  "provider": "docuseal",
  "document": {
    "postId": "…",
    "slug": "consulting-agreement",
    "title": "Consulting agreement",
    "versionNumber": 2,
    "sha256": "3b9f0c2a71de…",
    "fileName": "Consulting agreement (v2).pdf"
  },
  "signers": [
    { "name": "John Adams", "email": "adams@company.example", "role": "Signer 1", "order": 1, "status": "draft" }
  ],
  "order": "sequential",
  "message": null,
  "expiresAt": null,
  "fileTo": null,
  "confirmation": {
    "mode": "chat",
    "approveUrl": "https://opendocs.cc/dashboard/integrations/signatures/5b0e2c9a-7d14-4f3b-9a61-3c8e0d2f7b45"
  },
  "sentAt": null,
  "confirmedVia": null,
  "completedAt": null,
  "filed": null,
  "lastError": null,
  "createdAt": "2026-10-24T10:02:11.000Z",
  "warnings": ["adams@company.example is outside your workspace's email domains."]
}
```

`warnings` comes only with a new draft. Signer `status` is `draft`, `awaiting`,
`sent`, `opened`, `completed` or `declined`; a signer can also carry `completedAt`
and `declineReason`. `confirmedVia` is `chat` or `browser` once sent. With
parallel signing, every signer has `order: 1`.

The API endpoints:

| Endpoint | What it does |
| --- | --- |
| `POST /api/v1/posts/{postIdOrSlug}/signature-requests` | Create a draft. |
| `POST /api/v1/signature-requests/{id}/send` | Send a draft. Needs `{ "confirm": true }`, or answers `400 confirmation_required`. |
| `GET /api/v1/signature-requests?workspaceId=…` | List (optional `post`, `status`). |
| `GET /api/v1/signature-requests/{id}` | One request, refreshed from DocuSeal. |
| `DELETE /api/v1/signature-requests/{id}` | Cancel. |
| `GET /api/v1/signature-requests/{id}/documents/{kind}` | `draft`, `signed` or `audit` PDF. |
| `POST /api/v1/signature-requests/{id}/storage` | File the signed PDF and audit log to `{ "destination" }`. |

Creating a draft, downloading and filing count against the export rate limit (120 a
minute). Details in the [Integrations API](../api-reference/integrations.md).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `plan_required` | Upgrade the workspace at [opendocs.cc/dashboard/billing](https://opendocs.cc/dashboard/billing). |
| `integration_not_connected` | DocuSeal isn't connected to this workspace. An owner or admin connects it on the Integrations page. |
| "DocuSeal didn't accept that key on docuseal.com" (or .eu) | Check the key, and that the region matches where your DocuSeal account is. |
| `signer_roles_mismatch` | The document's signature block has roles that don't match the signers. The error lists the roles; tell your agent who signs for each. |
| `invalid_signers` | A signer is missing a name, has an invalid email, or a role is repeated. Your agent asks you for the missing details rather than guessing. |
| `confirm_required` | Your agent tried to send or cancel without your confirmation, and the CLI stopped it. Nothing was sent. |
| `approval_required` | The workspace confirms signature requests in the browser. Open the link your agent gives you and click **Send**. |
| `already_sent` | The request isn't a draft any more. Ask your agent for its status. |
| `not_completed` | Not everyone has signed, so there's no signed PDF yet. |
| `not_available` | The draft PDF is only kept until the request is sent, or DocuSeal doesn't have the document yet. |
| `reconnect_required`, or **Needs reconnecting** | DocuSeal rejected the API key (revoked or rotated). An owner or admin pastes a new key on the DocuSeal card. |
| `send_failed` | DocuSeal didn't accept the request; the message has its reason. The request stays a draft, so you can try again. |
| `invalid_expiry` | Use a date like `2026-11-30`, at least an hour from now. |
| `export_failed` or `export_timeout` | The draft PDF couldn't be rendered. Try again in a minute. |
| The status hasn't changed | Without the webhook, statuses update when someone checks the request. Ask your agent for the status, or add the webhook. |
| The signature block shows as code | The block breaks a rule: check that every entry starts with `- ` and has a unique `role`. |

## Related pages

- [Google Drive](./google-drive.md)
- [Branded PDF and Word exports](../publishing/branded-exports.md)
- [Plans and limits](../getting-started/plans-and-limits.md)
- [CLI reference](../cli/reference.md)
- [Integrations API](../api-reference/integrations.md)
