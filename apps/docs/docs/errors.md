---
title: Error codes
description: Every OpenDocs API error code and the common CLI ones, what each means and how to fix it.
---

# Error codes

Every API error is JSON with a stable `error` code, a `message` that says how
to fix it, and a `docs_url` pointing at the code on this page
(`https://docs.opendocs.cc/errors#<code>`, with `_` written as `-`). The CLI
prints the message; with `--json` it writes `{ "error", "message" }` to stderr
and exits non-zero. Status codes and extra fields are listed in
[Errors and pagination](/api-reference/errors-and-pagination).

## Signing in

| Code | Meaning | What to do |
|---|---|---|
| <a id="unauthorized"></a>`unauthorized` | Missing or invalid API key or session. Also a session-only route called with an API key, or a DocuSeal webhook with the wrong token. | `opendocs login --email you@example.com`, or pass a valid `od_live_` key. Session-only routes need the dashboard. |
| <a id="not-logged-in"></a>`not_logged_in` | The CLI has no saved credentials. | Sign in with an emailed code, or publish with `--anonymous`. |
| <a id="invalid-code"></a>`invalid_code` | The sign-in code is wrong for this email. | Use the newest email's code or request a new one. |
| <a id="code-expired"></a>`code_expired` | The sign-in code is older than 10 minutes. | Request a new code. |
| <a id="too-many-attempts"></a>`too_many_attempts` | Five wrong codes in a row. | Request a new code. |
| <a id="signups-disabled"></a>`signups_disabled` | New accounts are temporarily closed. | Existing accounts can still sign in. |
| <a id="not-available"></a>`not_available` | Anonymous publishing and the free tools are off on this server (a self-hosted instance). | Sign in to the server and publish to your workspace. |
| <a id="onboarding-incomplete"></a>`onboarding_incomplete` | The account has no workspace yet. | Finish setup at opendocs.cc/onboarding, then sign in again. |
| <a id="email-not-verified"></a>`email_not_verified` | Accepting an invitation, joining by domain or adding an auto-join domain needs a verified email. | Sign in once with an emailed code (`opendocs login --email`), then retry. |

## Requests and limits

| Code | Meaning | What to do |
|---|---|---|
| <a id="invalid-request"></a>`invalid_request` | The request body or query failed validation, or the body isn't valid JSON. | `message` names the field and the problem; `issues` lists every field. |
| <a id="payload-too-large"></a>`payload_too_large` | The request body is over the size limit: 2 MB, or 32 MB for a batch publish. | Send a smaller document, or split the batch into several requests. |
| <a id="missing-workspace-id"></a>`missing_workspace_id` | The route needs `?workspaceId=` (or a `workspaceId` form field) and got none. | Pass the workspace id. `GET /api/v1/workspaces` lists yours. |
| <a id="rate-limited"></a>`rate_limited` | Too many requests in a short time, or 4 exports already running. | Wait `Retry-After` seconds and retry. The CLI does this for you. |
| <a id="service-busy"></a>`service_busy` | The free converter or anonymous publishing is at its limit across everyone using it (`503`). | Wait `Retry-After` seconds and retry, or sign in: signed-in publishing and exports aren't affected. |
| <a id="document-limit"></a>`document_limit` | The plan's document cap would be exceeded. | Upgrade, unpublish old documents, or publish fewer. |
| <a id="plan-limit"></a>`plan_limit` | You own as many workspaces as your plan allows. | Upgrade in the dashboard, or delete a workspace. |
| <a id="plan-required"></a>`plan_required` | A Pro feature on a Free workspace: a custom export footer, integrations (Google Drive, e-signatures) or a custom domain. Brand color, font, presets and logo work on every plan. | Upgrade in the dashboard. Until then Free exports keep the "Made with OpenDocs" footer. |
| <a id="member-limit"></a>`member_limit` | Members plus pending invitations are at the workspace plan's cap. | Upgrade, cancel an invitation or remove a member. |
| <a id="invite-limit"></a>`invite_limit` | The workspace already has 50 pending invitations. | Cancel some, or wait for them to be accepted or expire. |
| <a id="billing-failed"></a>`billing_failed` | Joining a Team workspace needed another seat and billing couldn't be updated. | Ask the workspace owner to check billing. |

## Documents

| Code | Meaning | What to do |
|---|---|---|
| <a id="not-found"></a>`not_found` | The document (or other resource) doesn't exist or you can't read it. | Check `opendocs list`; slugs are scoped to the active workspace. A teammate's private document and another workspace's documents answer `not_found` too. |
| <a id="version-conflict"></a>`version_conflict` | Someone published a newer version since your copy. | Pull the live version, or re-run with `--force` to overwrite. |
| <a id="version-not-found"></a>`version_not_found` | That version number doesn't exist. | `opendocs history <doc>`. |
| <a id="forbidden"></a>`forbidden` | You can't make this change. Any workspace member can edit a document; changing its visibility, moving, sharing, unpublishing or deleting it takes the author, an owner or an admin. Also returned when a workspace limits integrations to admins, or your role can't change a setting. | Ask the author or a workspace owner or admin. |
| <a id="reserved-slug"></a>`reserved_slug` | The slug collides with an OpenDocs route (documents: `tag`, `tags`, `project`, `projects`; workspaces: `docs`, `pricing` and others). | Pick another slug. |
| <a id="publish-failed"></a>`publish_failed` / <a id="update-failed"></a>`update_failed` | The server couldn't save the document. On publish this includes a workspace you aren't in or a project that doesn't exist; on update, an unpublished document. | Check the workspace and project, then retry; if it persists, contact support. |
| <a id="unpublish-failed"></a>`unpublish_failed` | The document is already unpublished, or couldn't be unpublished. | Check `opendocs list`; retry if it's still live. |
| <a id="visibility-change-failed"></a>`visibility_change_failed` | `public` without confirmation, or an unpublished document. | Pass `confirmPublic: true` (CLI: `--confirm-public`). An unpublished document's visibility can't change. |
| <a id="invalid-visibility"></a>`invalid_visibility` | `visibility` isn't `private`, `workspace` or `public`. | Use one of those three. |
| <a id="tag-update-failed"></a>`tag_update_failed` | The document would have more than 20 tags. | Remove some tags first. |
| <a id="delete-failed"></a>`delete_failed` | The delete couldn't complete. | Retry; if it persists, contact support. |
| <a id="move-failed"></a>`move_failed` / <a id="restore-failed"></a>`restore_failed` | The move or version restore couldn't complete. | Retry; check the project and version exist. |
| <a id="share-failed"></a>`share_failed` / <a id="unshare-failed"></a>`unshare_failed` | Sharing couldn't be read or changed, usually because the document is unpublished. | Publish it first, then share. |
| <a id="project-not-found"></a>`project_not_found` | Unknown project. | `opendocs project list`. |
| <a id="invalid-claim-token"></a>`invalid_claim_token` | The claim token doesn't match the anonymous document. | Use the claim URL from the original publish. |
| <a id="expired"></a>`expired` | The anonymous document's 24 hours are up, or the invitation's 7 days. | Publish it again, or ask for the invitation to be resent. |
| <a id="hidden"></a>`hidden` | Readers reported the anonymous document, so it's hidden and can't be updated or claimed while it's reviewed. | Wait for the review, or publish the content again. |
| <a id="no-accessible-posts"></a>`no_accessible_posts` | A workspace Markdown download found nothing you can read. | Sign in as a member, or ask for documents to be made public. |

## Exports and files

| Code | Meaning | What to do |
|---|---|---|
| <a id="docx-requires-pro"></a>`docx_requires_pro` | Word export needs the workspace on Pro or Team. | Export as PDF, or upgrade. |
| <a id="export-failed"></a>`export_failed` | The PDF/DOCX converter failed (exports, Drive saves, signature drafts). | Retry; the document itself is unaffected. |
| <a id="export-timeout"></a>`export_timeout` | The converter didn't answer within 55 seconds. | Retry; very long documents may need splitting. |
| <a id="converter-failed"></a>`converter_failed` / <a id="converter-timeout"></a>`converter_timeout` | One document in a batch export failed or timed out (in `manifest.json`). | Retry that document. |
| <a id="conversion-failed"></a>`conversion_failed` | The free converter couldn't convert the file. | Simplify the Markdown or remove embedded images. |
| <a id="missing-file"></a>`missing_file` / <a id="empty-file"></a>`empty_file` | An upload had no `file` field, or the file was blank. | Send the file as multipart field `file`. |
| <a id="unsupported-mime"></a>`unsupported_mime` | The upload isn't a type the endpoint takes: JPEG, PNG, WebP, GIF or SVG for images, avatars and logos, `.md` or `.markdown` for the free converter. | Convert it to one of those. |
| <a id="file-too-large"></a>`file_too_large` | The upload is over its size limit (2 MB for avatars, logos and the free converter). | Use a smaller file. |
| <a id="storage-not-configured"></a>`storage_not_configured` | This server has no object storage set up. | Self-hosted only: configure storage. |

## Workspaces, projects and people

| Code | Meaning | What to do |
|---|---|---|
| <a id="invalid-slug"></a>`invalid_slug` | A workspace or project slug breaks the rules (workspaces: 3 to 32 of `a-z 0-9 _ -`; projects: up to 64 of `a-z 0-9` and single hyphens). | `message` has the rule. |
| <a id="slug-taken"></a>`slug_taken` | Another workspace (or project in the workspace) has that slug. | Pick another; `opendocs workspace create --slug`. |
| <a id="default-project"></a>`default_project` | The Default project can't be renamed or deleted. | Create another project instead. |
| <a id="project-not-empty"></a>`project_not_empty` | The project still has documents (`postCount`). | Move or delete them first. |
| <a id="confirmation-mismatch"></a>`confirmation_mismatch` | Deleting a workspace: `confirmSlug` isn't its slug. | Type the workspace slug exactly. |
| <a id="last-workspace"></a>`last_workspace` | You can't delete your only workspace. | Create or join another first, or delete your account. |
| <a id="already-member"></a>`already_member` / <a id="already-invited"></a>`already_invited` | That person is already in, or already invited. | Nothing to do. |
| <a id="owner-cannot-leave"></a>`owner_cannot_leave` | The owner can't leave their own workspace. | Transfer ownership or delete the workspace. |
| <a id="invalid-domain"></a>`invalid_domain` | The auto-join domain doesn't look like `halvard.example`. | Pass a bare domain. |
| <a id="consumer-domain"></a>`consumer_domain` | Personal email providers (gmail.com, outlook.com...) can't be auto-join domains. | Use your organization's domain. |
| <a id="domain-mismatch"></a>`domain_mismatch` | You can only add your own email's domain (`yourDomain`). | Ask someone with an address at that domain. |
| <a id="invalid-hostname"></a>`invalid_hostname` | The custom domain isn't one OpenDocs can serve: not a valid domain name, an IP address, an OpenDocs or reserved domain, or an apex domain on a server without apex support. `reason` says which. | Enter a name like `notes.example.com`, without `https://` or a path. See [Custom domains](/publishing/custom-domains). |
| <a id="domain-taken"></a>`domain_taken` | Another workspace has that custom domain connected and active. | Remove it from the other workspace first. If you can't, replace that workspace's `opendocs-verify` TXT value with yours: once its checks fail, the domain can be connected here. |
| <a id="onboarding-failed"></a>`onboarding_failed` | Onboarding couldn't finish: username or workspace slug invalid, reserved or taken, or no workspace name. | Check both with the [availability endpoints](/api-reference/usernames) and retry. |
| <a id="invalid-username"></a>`invalid_username` / <a id="reserved-username"></a>`reserved_username` | The new username has characters other than `a-z 0-9 _ -`, or is reserved. | Pick another. |
| <a id="username-taken"></a>`username_taken` | Someone else has that username. | Pick another. |
| <a id="no-username"></a>`no_username` | You haven't finished onboarding, so there's no username to rename. | Finish onboarding first. |

## Branding

| Code | Meaning | What to do |
|---|---|---|
| <a id="low-contrast"></a>`low_contrast` | The brand color is lighter than 4.5:1 against white, so headings and white table-header text would be hard to read. | Use a darker shade of the same hue. Check with `opendocs theme check <hex>`. |
| <a id="invalid-preset"></a>`invalid_preset` / <a id="invalid-font"></a>`invalid_font` | Unknown export preset or font. | `opendocs theme presets` / `opendocs theme fonts`. |
| <a id="invalid-color"></a>`invalid_color` | The brand color isn't a hex color. | Use `#RRGGBB`, for example `#13294B`. |
| <a id="invalid-footer"></a>`invalid_footer` / <a id="invalid-input"></a>`invalid_input` | A footer value is too long or the link isn't a URL. | Keep text under 120 characters; use a real URL. |
| <a id="nothing-to-change"></a>`nothing_to_change` | A branding update had no fields. | Pass a preset, color, font, logo setting or footer. |

## Integrations

| Code | Meaning | What to do |
|---|---|---|
| <a id="integration-not-connected"></a>`integration_not_connected` | Google Drive or DocuSeal isn't connected to this workspace. | An owner or admin connects it in the dashboard's Integrations tab. |
| <a id="reconnect-required"></a>`reconnect_required` | The integration's access was revoked or expired. | An owner or admin reconnects it in the Integrations tab. |
| <a id="destination-not-found"></a>`destination_not_found` | No Drive folder with that name. `destinations` lists the ones there are. | Use one of those names, or have an admin add the folder. |
| <a id="destination-unavailable"></a>`destination_unavailable` | Drive refused the folder: deleted, or the connected account lost access. | An admin picks the folder again in the dashboard. |
| <a id="storage-failed"></a>`storage_failed` | Uploading to Drive failed. | Retry. |
| <a id="confirmation-required"></a>`confirmation_required` | A signature request was sent without `{"confirm": true}`. | Show the person the document, version, signers and order; send with `confirm: true` only after they say yes. |
| <a id="approval-required"></a>`approval_required` | This workspace only lets a person send signature requests, from the browser. | Give the person `approveUrl` to review and send it. |
| <a id="invalid-signers"></a>`invalid_signers` | A signer's email is invalid, or roles repeat or contain `; { } =`. | Fix the signer list. |
| <a id="signer-roles-mismatch"></a>`signer_roles_mismatch` | The signers don't match the document's signature block (`roles`). | Give exactly one signer per role, with `role` set to match. |
| <a id="invalid-expiry"></a>`invalid_expiry` | `expiresAt` isn't a date, or is less than an hour away. | Use a later date like `2026-11-30`. |
| <a id="already-sent"></a>`already_sent` | The signature request isn't a draft any more (`status`). | Check its status; create a new request to send again. |
| <a id="already-completed"></a>`already_completed` | Everyone already signed, so it can't be cancelled. | Nothing to cancel. |
| <a id="not-completed"></a>`not_completed` | The signed PDF and audit log exist only once everyone has signed (`status`). | Check back later with `opendocs sign status`. |
| <a id="not-available"></a>`not_available` | The file isn't there: a draft PDF after sending, or DocuSeal hasn't produced it yet. | Download the signed copy instead, or try again shortly. |
| <a id="send-failed"></a>`send_failed` / <a id="cancel-failed"></a>`cancel_failed` / <a id="provider-failed"></a>`provider_failed` | DocuSeal rejected or didn't answer the request. A failed send stays a draft with `lastError`. | Read `message`, fix what it names, and retry. |
| <a id="invalid-kind"></a>`invalid_kind` | The document kind isn't `draft`, `signed` or `audit`. | Use one of those. |
| <a id="invalid-payload"></a>`invalid_payload` | A DocuSeal webhook body wasn't valid JSON. | Sent to DocuSeal, not to you. |
| <a id="integrations-not-configured"></a>`integrations_not_configured` | This server has no integrations encryption key. | Self-hosted only: set the key. |

## Account

| Code | Meaning | What to do |
|---|---|---|
| <a id="active-plan"></a>`active_plan` | The account can't be deleted while a paid subscription is active (`code` field). | Cancel the subscription first. |
| <a id="team-workspace-with-members"></a>`team_workspace_with_members` | You own a Team workspace with other active members (`code` field). | Transfer or empty those workspaces first. |

## CLI only

| Code | Meaning | What to do |
|---|---|---|
| <a id="confirm-required"></a>`confirm_required` | A command that affects others or every export (theme changes, team changes, sending or cancelling a signature request) ran without `--yes` outside a terminal. | Ask the person, then pass `--yes`. |
| <a id="confirm-public-required"></a>`confirm_public_required` | Making a document public without `--confirm-public`. | Ask the person, then pass `--confirm-public`. |
| <a id="no-workspace"></a>`no_workspace` | The CLI has no active workspace. | `opendocs login`, or `opendocs workspace use <slug>`. |
| <a id="doc-too-large"></a>`doc_too_large` | A file is over the 1 MB per-document limit. | Split it into smaller documents. |

## Server

| Code | Meaning | What to do |
|---|---|---|
| <a id="internal-error"></a>`internal_error` | Unexpected server error. | Retry; contact support if it persists. |
