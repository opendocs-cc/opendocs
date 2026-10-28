/**
 * Serialize structured data for a `<script type="application/ld+json">` tag.
 * `JSON.stringify` leaves `<` intact, so a user-controlled string containing
 * `</script>` would close the tag and inject markup. Escaping every `<` keeps
 * the JSON identical once parsed.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
