function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text: string) {
  return decodeHtmlEntities(
    text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function extractTextFromHtml(html: string) {
  return stripHtml(normalizeStoredRenderedHtml(html));
}

export function normalizeStoredRenderedHtml(html: string) {
  const normalizedIds = html.replace(/id="user-content-([^"]+)"/g, 'id="$1"');

  return normalizedIds.replace(
    /<(h[1-6])([^>]*)id="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g,
    (_fullMatch, tagName: string, beforeId: string, id: string, afterId: string, inner: string) => {
      const content = inner.replace(/<a[^>]*title="Permanent link"[^>]*>[\s\S]*?<\/a>/g, "").trim();

      return `<${tagName}${beforeId}id="${id}"${afterId}>${content}<a href="#${id}" title="Permanent link" aria-hidden="true">¶</a></${tagName}>`;
    },
  );
}

export function extractSearchSectionsFromHtml(title: string, html: string) {
  const normalizedHtml = normalizeStoredRenderedHtml(html);
  const headingPattern = /<h([1-6])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  const headings = Array.from(normalizedHtml.matchAll(headingPattern));
  const introText = stripHtml(
    normalizedHtml.slice(0, headings[0]?.index ?? normalizedHtml.length),
  );

  if (headings.length === 0) {
    return [
      {
        id: "",
        title,
        text: introText,
      },
    ];
  }

  const sections = headings.map((match, index) => {
    const currentHeading = match[0];
    const id = match[2] ?? "";
    const headingInnerHtml = (match[3] ?? "").replace(
      /<a[^>]*title="Permanent link"[^>]*>[\s\S]*?<\/a>/g,
      "",
    );
    const headingText = stripHtml(headingInnerHtml) || title;
    const start = match.index ?? 0;
    const contentStart = start + currentHeading.length;
    const contentEnd = headings[index + 1]?.index ?? normalizedHtml.length;
    const sectionHtml = normalizedHtml.slice(contentStart, contentEnd);

    return {
      id,
      title: headingText,
      text: stripHtml(sectionHtml),
    };
  });

  if (introText && sections[0]) {
    sections[0].text = `${introText} ${sections[0].text}`.trim();
  }

  if (sections.length > 1 && sections[0]?.title === title) {
    return sections.slice(1);
  }

  return sections;
}
