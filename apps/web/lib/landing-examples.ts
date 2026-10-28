/**
 * Sample documents shown on the landing page. Each one is real converter
 * output: the Markdown below (abridged here; full sources in
 * scripts/landing-examples) exported with one of the branding presets and a
 * sample logo. Page images and PDFs live in public/examples.
 *
 * The organizations are fictional.
 */
export type LandingExample = {
  slug: string;
  label: string;
  title: string;
  organization: string;
  presetId: string;
  presetName: string;
  brandColor: string;
  font: string;
  /** What someone might ask their agent for this document. */
  prompt: string;
  /** The opening lines of the Markdown source. */
  markdown: string;
};

export const LANDING_EXAMPLES: readonly LandingExample[] = [
  {
    slug: "investor-update",
    label: "Investor update",
    title: "Q3 2026 investor update",
    organization: "Halvard Capital",
    presetId: "boardroom",
    presetName: "Boardroom",
    brandColor: "#13294B",
    font: "IBM Plex Sans",
    prompt: "Turn these notes into our Q3 investor update and send me the PDF.",
    markdown: `# Q3 2026 investor update

Halvard Capital closed the quarter with three
new platform investments and a stronger cash
position than planned.

## Portfolio at a glance

| Company            | Invested | Fair value |
| ------------------ | -------: | ---------: |
| Brightline Freight |    6.0 M |      9.1 M |
| Corvid Health      |    4.5 M |      5.2 M |`,
  },
  {
    slug: "annual-letter",
    label: "Reader letter",
    title: "The case for slower software",
    organization: "Ledger & Lane",
    presetId: "editorial",
    presetName: "Editorial",
    brandColor: "#6E1F2A",
    font: "Vollkorn",
    prompt: "Publish this year's letter to readers and make a print version.",
    markdown: `# The case for slower software

Every year we write to the people who read
us, to explain what we published, what we got
wrong, and what we want to do next.

## What we published

We ran forty-two long-form pieces this year,
fewer than last year and longer on average.`,
  },
  {
    slug: "field-study",
    label: "Field study",
    title: "Soil carbon in restored peatlands",
    organization: "Mossbank Institute",
    presetId: "research",
    presetName: "Research",
    brandColor: "#1F4D3A",
    font: "Merriweather",
    prompt: "Write up the peatland results as a report for the funders.",
    markdown: `# Soil carbon in restored peatlands

## Abstract

We measured soil organic carbon in twelve
peatland plots three, six and nine years
after rewetting.

| Plot group | Years | Carbon change |
| ---------- | ----: | ------------: |
| Rewetted A |     3 |          +0.9 |`,
  },
  {
    slug: "product-spec",
    label: "Product spec",
    title: "Product spec: offline mode",
    organization: "Arcwell",
    presetId: "studio",
    presetName: "Studio",
    brandColor: "#1F2328",
    font: "Inter",
    prompt: "Draft the offline mode spec in the Product project and share it with the team.",
    markdown: `# Product spec: offline mode

## Problem

Field technicians lose signal in basements,
plant rooms and rural sites.

## Goals

- Open the last 50 viewed work orders offline.
- Never lose work, even before it syncs.`,
  },
  {
    slug: "staff-handbook",
    label: "Staff handbook",
    title: "Your first week at Tidewater",
    organization: "Tidewater Clinic",
    presetId: "field-guide",
    presetName: "Field guide",
    brandColor: "#0F4C5C",
    font: "Lato",
    prompt: "Update the first-week guide and give the front desk a printable copy.",
    markdown: `# Your first week at Tidewater

Welcome to Tidewater Clinic. This guide
covers your first five days.

## Day one

- Collect your badge and scrubs before 8:00.
- Meet your preceptor.
- Complete the infection control module.`,
  },
  {
    slug: "proposal",
    label: "Proposal",
    title: "Proposal: restoring the Pier Street warehouse",
    organization: "Calloway & Reid Architects",
    presetId: "letterpress",
    presetName: "Letterpress",
    brandColor: "#7C2D12",
    font: "EB Garamond",
    prompt: "Turn my site notes into a proposal for the Pier Street Trust, with fees.",
    markdown: `# Proposal: restoring the Pier Street warehouse

## Our understanding

The Pier Street warehouse was built in
1891 to store grain and has stood empty
since 2009.

| Stage  | Duration |
| ------ | -------: |
| Survey |  6 weeks |
| Design | 14 weeks |`,
  },
  {
    slug: "incident-review",
    label: "Incident review",
    title: "Incident review: slow checkouts",
    organization: "Northbeam Payments",
    presetId: "terminal",
    presetName: "Terminal",
    brandColor: "#1E40AF",
    font: "JetBrains Mono",
    prompt: "Write up yesterday's checkout incident from the Slack thread and the graphs.",
    markdown: `# Incident review: slow checkouts

## Summary

For 47 minutes, card checkouts took up
to 9 seconds to confirm.

## Root cause

\`\`\`yaml
database:
  pool_size: 12   # was 40
\`\`\``,
  },
  {
    slug: "launch-brief",
    label: "Launch brief",
    title: "Launch brief: Kestrel 2.0",
    organization: "Kestrel",
    presetId: "launch",
    presetName: "Launch",
    brandColor: "#86198F",
    font: "Manrope",
    prompt: "Draft the Kestrel 2.0 launch brief for the team and share the link.",
    markdown: `# Launch brief: Kestrel 2.0

## The one-liner

Kestrel 2.0 turns every customer call
into a searchable brief, with the
follow-ups already drafted.

## What's new

- Call briefs
- Drafted follow-ups`,
  },
] as const;

/** Rendered page size of the preview images (US Letter at 1000px wide). */
export const EXAMPLE_PAGE_SIZE = { width: 1000, height: 1413 } as const;
