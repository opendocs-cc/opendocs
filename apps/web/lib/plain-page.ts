/**
 * A minimal standalone HTML page for responses that can't render the app
 * (middleware, the sign-in bridge's route handlers): a heading, a line of
 * text, an optional one-button form and optional links, in the app's
 * colors, light and dark.
 */

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function plainHtmlPage({
  title,
  message,
  links = [],
  form,
  status = 200,
}: {
  title: string;
  message: string;
  links?: Array<{ href: string; label: string }>;
  /** A POST form with hidden fields and one submit button, above the links. */
  form?: { action: string; fields: Record<string, string>; submitLabel: string };
  status?: number;
}): Response {
  const formHtml = form
    ? `<form method="post" action="${escapeHtml(form.action)}">${Object.entries(form.fields)
        .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
        .join("")}<button type="submit">${escapeHtml(form.submitLabel)}</button></form>`
    : "";
  const linkHtml = links
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join(" ");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, sans-serif; background: #fafafa; color: #18181b; padding: 24px; box-sizing: border-box; }
  main { max-width: 440px; text-align: center; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
  p { font-size: 15px; line-height: 1.6; color: #52525b; margin: 0 0 20px; }
  a { color: #6941c6; font-weight: 500; margin: 0 8px; }
  form { margin: 0 0 16px; }
  button { font: inherit; font-size: 14px; font-weight: 600; height: 40px; padding: 0 20px; border: 0; border-radius: 999px; background: #18181b; color: #fff; cursor: pointer; }
  button:hover { background: #3f3f46; }
  @media (prefers-color-scheme: dark) { body { background: #09090b; color: #fafafa; } p { color: #a1a1aa; } a { color: #a78bfa; } button { background: #fafafa; color: #18181b; } button:hover { background: #e4e4e7; } }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  ${formHtml}
  ${linkHtml ? `<div>${linkHtml}</div>` : ""}
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Never framed: the bridge's confirmation button must be clicked on
      // its own page.
      "content-security-policy": "frame-ancestors 'none'",
      "x-frame-options": "DENY",
    },
  });
}
