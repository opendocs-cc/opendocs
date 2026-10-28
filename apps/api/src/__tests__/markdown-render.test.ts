import { describe, expect, it } from "vitest";

import { renderMarkdown } from "@opendocs/shared/markdown";

async function html(markdown: string) {
  return (await renderMarkdown(markdown)).html;
}

describe("renderMarkdown", () => {
  it("renders GitHub alerts as titled callouts", async () => {
    const out = await html("> [!WARNING]\n> Back up **first**.");
    expect(out).toContain('<div class="markdown-alert markdown-alert-warning">');
    expect(out).toContain('<p class="markdown-alert-title">Warning</p>');
    expect(out).toContain("Back up <strong>first</strong>.");
    expect(out).not.toContain("[!WARNING]");
  });

  it("keeps an ordinary quote a blockquote", async () => {
    expect(await html("> Just a quote")).toContain("<blockquote>");
  });

  it("supports highlight, sub- and superscript beside ~~strikethrough~~", async () => {
    const out = await html("==key== H~2~O x^2^ ~~gone~~");
    expect(out).toContain("<mark>key</mark>");
    expect(out).toContain("H<sub>2</sub>O");
    expect(out).toContain("x<sup>2</sup>");
    expect(out).toContain("<del>gone</del>");
  });

  it("typesets $math$ but leaves prices alone", async () => {
    const math = await html("Euler: $e^{i\\pi} + 1 = 0$");
    expect(math).toContain('class="katex"');

    const prices = await html("Pro costs $8/mo and Team $4/user/mo. Between $5 and $10.");
    expect(prices).not.toContain("katex");
    expect(prices).toContain("$8/mo and Team $4/user/mo");
  });

  it("renders $$ blocks and formula(...) as display math", async () => {
    expect(await html("$$\n\\int x\\,dx\n$$")).toContain("katex-display");
    expect(await html("formula(E = mc^2)")).toContain("katex-display");
  });

  it("lets safe inline HTML through and strips the rest", async () => {
    const out = await html(
      'Press <kbd>Cmd</kbd>, <mark>note</mark>, H<sub>2</sub>O.\n\n' +
        '<details><summary>More</summary>Hidden</details>\n\n' +
        '<p onclick="alert(1)" style="color:red">Text</p>\n\n<script>alert(1)</script>',
    );
    expect(out).toContain("<kbd>Cmd</kbd>");
    expect(out).toContain("<mark>note</mark>");
    expect(out).toContain("<details><summary>More</summary>");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("style=");
    expect(out).not.toContain("<script");
  });

  it("captions an image with the italic line under it, or its title", async () => {
    const captioned = await html("![Chart](https://example.com/c.png)\n\n*Revenue by month.*");
    expect(captioned).toMatch(/<figure class="od-figure"><img[^>]+><figcaption>Revenue by month\.<\/figcaption><\/figure>/);

    const titled = await html('![Chart](https://example.com/c.png "Quarterly revenue")');
    expect(titled).toContain("<figcaption>Quarterly revenue</figcaption>");

    const inline = await html("An icon ![i](https://example.com/i.png) in text.");
    expect(inline).not.toContain("<figure");
  });

  it("renders definition lists and abbreviations", async () => {
    const out = await html("Markdown\n: A markup language.\n\nHTML\n: Web pages.\n\n*[HTML]: HyperText Markup Language");
    expect(out).toContain("<dl><dt>Markdown</dt><dd>A markup language.</dd><dt>");
    expect(out).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(out).not.toContain("*[HTML]");
  });

  it("turns page-break markers into a print break", async () => {
    expect(await html("A\n\n\\pagebreak\n\nB")).toContain('<div class="page-break"></div>');
    expect(await html('A\n\n<div style="page-break-after: always"></div>\n\nB')).toContain(
      '<div class="page-break"></div>',
    );
  });

  it("marks the leading title and the metadata line under it", async () => {
    const out = await html("# Report\n\nAuthor: Jane | Version: 2\n\nBody.");
    expect(out).toMatch(/<h1 class="od-doc-title" id="report">/);
    expect(out).toContain('<p class="od-meta">Author: Jane<span class="od-meta-sep">·</span>Version: 2</p>');
    expect(out).toContain("<p>Body.</p>");
  });

  it("uses smart quotes and dashes outside code", async () => {
    const out = await html('"Quoted" -- and --- and `"code"`');
    expect(out).toContain("“Quoted” – and —");
    expect(out).toContain('<code>"code"</code>');
  });

  it("keeps footnotes, task lists and private blocks working", async () => {
    const out = await html("Note.[^1]\n\n- [x] Done\n\n```private\nSecret\n```\n\n[^1]: The note.");
    expect(out).toContain('data-footnote-ref');
    expect(out).toContain('type="checkbox"');
    expect(out).not.toContain("Secret");
  });
  it("renders a ```signature block as signing boxes", async () => {
    const out = await html(
      "```signature\n- role: Employee\n  name: John Adams\n  title: Engineer\n- role: Company\n```",
    );
    expect(out).toContain('<div class="od-signatures">');
    expect(out.match(/class="od-signature"/g)).toHaveLength(2);
    expect(out).toContain('<p class="od-signature-name">John Adams</p>');
    expect(out).toContain('<p class="od-signature-title">Engineer</p>');
    expect(out).toContain('<p class="od-signature-role">Employee</p>');
    // No name: the role is the label, and isn't repeated.
    expect(out).toContain('<p class="od-signature-name">Company</p>');
    expect(out).not.toContain('<p class="od-signature-role">Company</p>');
    expect(out).toContain('<span class="od-signature-date-line"></span>');
    expect(out).not.toContain("<pre");
  });

  it("keeps an invalid signature block as code", async () => {
    const out = await html("```signature\nnot a list\n```");
    expect(out).not.toContain("od-signatures");
    expect(out).toContain("not a list");
  });
});
