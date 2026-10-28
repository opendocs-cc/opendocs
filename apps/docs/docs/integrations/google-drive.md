---
title: Google Drive
description: Ask your agent to save any OpenDocs document into a named Google Drive folder as a PDF, Word file or Markdown, including shared drives. Pro and Team.
---

# Google Drive

Connect Google Drive to your workspace once, name the folders people should save
into, and from then on your agent can file any document there as a PDF, Word file
or Markdown. Signed contracts from [DocuSeal](./docuseal.md) can be filed
automatically. Nothing is saved to Drive unless someone asks.

> **Ask your agent**
>
> "Save the board minutes to the Board Minutes folder as a PDF."
>
> "Put version 3 of the Halvard onboarding guide in HR Policies as a Word file, and call it Onboarding guide 2026."
>
> "Which Drive folders can you save to?"

Google Drive is part of the Pro and Team plans. On Free, the dashboard's
**Integrations** page shows an upgrade prompt and agents get `plan_required`.

## What you need

- A workspace on Pro or Team. See [Plans and limits](../getting-started/plans-and-limits.md).
- An owner or admin of the workspace to connect Drive and add folders. This is done
  once, in the dashboard; agents can't connect Drive or add folders.
- A Google account that can add files to the folders you want to use: a
  Contributor or above on a shared drive, or someone who can edit the folder in My
  Drive. This one account is used for everyone in the workspace.

## Connect Google Drive

1. In the [dashboard](https://opendocs.cc/dashboard), open **Integrations** (under
   **Workspace** in the sidebar).
2. Under **Google Drive**, click **Connect Google Drive**.
3. Sign in with the Google account that can add files to your shared drives, and
   allow access. Leave the Drive permission ticked on Google's screen.
4. You're back on the Integrations page. The card says **Connected** and shows the
   account's email.

## Add and name folders

Agents only see the folders you add here, by the names you give them.

1. Click **Add folder**. Google's folder picker opens, titled "Choose a folder for
   OpenDocs", with your shared drives and My Drive.
2. Pick a folder.
3. Type the name your agent should use, for example "Board Minutes". It starts as
   the folder's own name. Names can be up to 80 characters and must be unique in
   the workspace (ignoring case).
4. Click **Save**.

Each folder in the list shows its name and where it lives (the shared drive or My
Drive, then the folder). Use the pencil to rename it and the trash icon to remove
it. Removing a folder only removes it from OpenDocs; nothing in Drive is touched.

## Who can use it

Owners and admins connect Drive, add folders and change settings. Who can save
documents is a workspace setting, under **Settings** on the Integrations page:

| **Who can use integrations** | What it means |
| --- | --- |
| **Every member** (default) | Anyone in the workspace can save to folders and send for signature. |
| **Owners and admins only** | Members can still read and publish documents, but saving to Drive returns `forbidden`. |

Everyone in the workspace can open the Integrations page and see what's connected.
To save a document you also need to be able to read it, the same rule as for
exports.

## What lands in Drive

- **A new file each time.** Saving again creates another file next to the first;
  nothing in Drive is overwritten or deleted.
- **File name:** the document's title plus the extension, for example
  `Board minutes October 2026.pdf`, unless you ask for another name. The
  characters `\ / : * ? " < > |` become spaces, and names are cut at 180
  characters.
- **Format:** PDF unless you ask for Word (`.docx`) or Markdown (`.md`). PDF and
  Word files use your workspace's [export theme](../publishing/branded-exports.md),
  exactly like an export. Markdown is the document's source, with
  [`private` blocks](../publishing/rendering-and-metadata.md) removed.
- **Version:** the latest version unless you ask for an earlier one by number
  ("version 3"). The file's Drive description says which document and version it
  came from: `Saved from OpenDocs: "Board minutes October 2026", version 3.`
- **Stored as-is.** Files aren't converted to Google Docs, and Drive keeps their
  first revision permanently.
- **Checked.** OpenDocs computes the file's SHA-256 before uploading and compares
  it with the checksum Google reports. Your agent tells you if they don't match.

Your agent gives you a link to the new file in Drive. OpenDocs also records every
save: who asked, through which agent, the document and version, the folder, and
both checksums.

### Signed copies

When a signature request finishes, OpenDocs can file the signed PDF and its audit
log in a Drive folder for you, either automatically or when you ask. Both files are
marked read-only in Drive. See
[File signed copies in Google Drive](./docuseal.md#file-signed-copies-in-google-drive).

## Privacy

- **OpenDocs only sees what it created and what you picked.** It connects with
  Google's `drive.file` permission, which covers files OpenDocs created and folders
  someone picked in the Google Picker. It can't browse, search or read anything
  else in your Drive. It also asks for your email address, to show which account
  is connected.
- **Only on request.** Publishing or exporting never saves to Drive. A file is
  saved only when someone asks for it, or when a signature request was set up to
  file its signed copy.
- **One account for the workspace.** Files are created by the connected Google
  account, whoever in the workspace asked for the save.
- **Disconnecting** (**Disconnect**, then **Disconnect and forget folders**) revokes
  OpenDocs' access with Google and forgets the folder names. Files already saved
  stay in Drive.

## Under the hood

Your agent uses two commands. `opendocs integrations` lists what's connected and
the folder names; `opendocs save` saves one document.

```bash
opendocs integrations --json
opendocs save board-minutes.md --folder "Board Minutes" --json
opendocs save halvard-onboarding-guide --folder "HR Policies" --format docx --version 3 --filename "Onboarding guide 2026" --json
```

`<doc>` is a post ID, a slug, or a local `.md` file this folder published.

| Flag | Default | Notes |
| --- | --- | --- |
| `--folder <name>` | Required | A folder name exactly as `opendocs integrations` lists it (case doesn't matter). |
| `--format <format>` | `pdf` | `pdf`, `docx` or `md`. |
| `--version <n>` | Latest | Save an earlier version (`3` or `v3`). See `opendocs history`. |
| `--filename <name>` | Document title | File name in Drive. A `.pdf`, `.docx` or `.md` ending is replaced with the right one. |

Rules agents follow: save only when the user asks, use a folder name exactly as
listed (never guess one), and give the user the Drive link on its own line.

`opendocs integrations --json` (trimmed):

```json
{
  "workspace": { "id": "…", "slug": "halvard", "name": "Halvard" },
  "tier": "pro",
  "role": "member",
  "canManage": false,
  "canUse": true,
  "settings": { "usableBy": "members", "signatureConfirmation": "chat" },
  "dashboardUrl": "https://opendocs.cc/dashboard/integrations",
  "integrations": [
    {
      "provider": "google_drive",
      "name": "Google Drive",
      "status": "connected",
      "account": "dana@halvard.example",
      "connectedAt": "2026-10-20T09:14:02.000Z",
      "destinations": [
        {
          "id": "…",
          "name": "Board Minutes",
          "folderName": "Board minutes",
          "driveName": "Halvard Leadership",
          "url": "https://drive.google.com/drive/folders/…"
        }
      ]
    }
  ]
}
```

`status` is `connected`, `not_connected` or `error` (needs reconnecting; `error`
then holds the reason). Agents use `destinations[].name` as `--folder`.

`opendocs save --json`:

```json
{
  "id": "…",
  "provider": "google_drive",
  "destination": { "id": "…", "name": "Board Minutes", "url": "https://drive.google.com/drive/folders/…" },
  "document": { "id": "…", "slug": "board-minutes", "title": "Board minutes October 2026", "versionNumber": 3 },
  "file": {
    "id": "…",
    "name": "Board minutes October 2026.pdf",
    "url": "https://drive.google.com/file/d/…/view",
    "bytes": 184320,
    "sha256": "9f2c…",
    "driveSha256": "9f2c…",
    "verified": true,
    "format": "pdf"
  }
}
```

`verified` is `true` when Google's checksum matches `sha256` (or Google didn't
report one; then `driveSha256` is `null`).

The API behind it is `GET /api/v1/integrations?workspaceId=…` and
`POST /api/v1/posts/{postIdOrSlug}/storage` with
`{ "destination", "format", "versionNumber", "filename" }`. Saves count against
the export rate limit (120 a minute). See
[Integrations API](../api-reference/integrations.md).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `plan_required`, or "Integrations are part of Pro and Team" | Upgrade the workspace at [opendocs.cc/dashboard/billing](https://opendocs.cc/dashboard/billing). |
| `integration_not_connected` | Google Drive isn't connected to this workspace. An owner or admin connects it on the Integrations page. |
| `destination_not_found` | There's no folder by that name. The error lists the folder names; ask your agent which folders exist, or have an admin add one. |
| `forbidden` | The workspace lets only owners and admins use integrations. Ask one of them, or ask them to change the setting. |
| `reconnect_required`, or **Needs reconnecting** in the dashboard | Google access was revoked or expired. An owner or admin clicks **Reconnect** and signs in with the same Google account, which keeps your folders. |
| `destination_unavailable` | Google refused access to that folder: it was deleted or moved, or the connected account lost access. Remove the folder and add it again with **Add folder**. |
| "can't add files to" a folder, when adding it | The connected account can only view that folder. Use a folder where it's a Contributor or above. |
| "OpenDocs needs the Google Drive permission" | The Drive permission was unticked on Google's screen. Connect again and leave it ticked. |
| "The Google sign-in expired or was started elsewhere" | The connection wasn't finished within 10 minutes, or started in another tab. Click **Connect Google Drive** again. |
| `storage_failed` | Google Drive returned an error. Try again; the message has Google's reason. |
| `export_failed` or `export_timeout` | The PDF or Word file couldn't be rendered, so nothing was uploaded. Try again in a minute. |
| "Google Drive's checksum doesn't match" | The file in Drive may differ from what OpenDocs rendered. Open it in Drive to check, and save again if needed. |

## Related pages

- [E-signatures with DocuSeal](./docuseal.md)
- [Branded PDF and Word exports](../publishing/branded-exports.md)
- [Plans and limits](../getting-started/plans-and-limits.md)
- [CLI reference](../cli/reference.md)
- [Integrations API](../api-reference/integrations.md)
