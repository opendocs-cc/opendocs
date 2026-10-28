---
title: Browser extension (ChatGPT, Claude, Gemini)
description: Publish an answer or a whole chat from ChatGPT, Claude or Gemini as an OpenDocs document with one click, with a link, a PDF and, when you're signed in, a copy in your workspace.
---

# Browser extension

The OpenDocs extension adds a **Publish** button to ChatGPT, Claude and Gemini.
One click turns an answer, or a whole chat, into a clean OpenDocs document:
a link you can share and a PDF. You don't need an account to try it.

It works in Chrome and Microsoft Edge. Install it from
[opendocs.cc/extension](https://opendocs.cc/extension).

## Publish an answer

1. Open a chat on [chatgpt.com](https://chatgpt.com), [claude.ai](https://claude.ai)
   or [gemini.google.com](https://gemini.google.com).
2. Under the answer you want, click **Publish** (the OpenDocs icon next to Copy).
3. Check the title and where it goes, then click **Publish**.

The link is copied for you. The card also has **Open**, **Download PDF** and,
on Pro, **Download Word**.

Turn on **Include my question** on the card to put your question above the
answer, so readers know what was asked. The extension remembers your choice.

## Publish a whole chat

Click **Publish** under any answer and switch the card to **Whole chat**, or
open the side panel (the OpenDocs icon in the toolbar) and choose **Publish
this chat**. Each of your questions appears as a quote above its answer.

## With or without an account

| | Without an account | Signed in |
| --- | --- | --- |
| Who can open the link | Anyone with it, for 24 hours | Your workspace by default; you can make it private or public |
| Size | Up to 512 KB of Markdown | Your plan's limits |
| Images | Left out, with a note | Included |
| PDF | Yes | Yes, with your workspace's branding |
| Word | No | Pro and Team |
| Update later at the same link | No | Yes |

Sign in from the card or the side panel. It opens the OpenDocs sign-in page,
where you can also create a free account, then asks what the extension may do.
Signing in moves the documents you published from this browser in the last
24 hours into your workspace, so their content is kept. They get new links in
your workspace; the anonymous links stop working.

## Choose where documents go

In the side panel, pick the workspace, the project and who can see new
documents. OpenDocs remembers these for the extension, the same way it does for
Claude or ChatGPT over [MCP](./mcp.md).

## Update a document

Signed in, publish the same answer or chat again and choose **Update**. The
link stays the same and the earlier version is kept in the document's history.

## What comes along

- Headings, lists, tables and code blocks, with the code's language
- Math, rendered on the page and in the PDF
- Web sources, as numbered footnotes with a list of sources at the end
- Images, when you're signed in
- The final version of a ChatGPT canvas or a Claude artifact
- Reasoning ("thinking") is always left out

## Privacy

- The extension only runs on chatgpt.com, claude.ai and gemini.google.com.
- It reads a chat only when you click **Publish**, and only the chat open in
  that tab. It never stores copies of your chats.
- It sends the content you chose to OpenDocs to make your document, and
  nothing else.
- If it can't read a chat, it tells us the site, the step that failed and an
  error code. Never the content.
- The code is open source:
  [github.com/opendocs-cc/opendocs-extension](https://github.com/opendocs-cc/opendocs-extension).

The [Privacy Policy](https://opendocs.cc/privacy#browser-extension) has the
details. To disconnect the extension from your account, open
**Dashboard → Connected apps**.

## Troubleshooting

**The Publish button doesn't show.** Chat sites change their pages now and
then. Open the side panel and use **Publish this chat** or **Publish the last
answer**; they work while we update the button. Reloading the chat tab can
also help.

**"Couldn't read this chat."** Some chat types aren't supported yet, such as
Claude's Cowork chats. The extension has already told us; try again after the
next update.

**"Too long to publish without an account."** Anonymous documents can be up to
512 KB. Sign in (free) to publish longer chats.
