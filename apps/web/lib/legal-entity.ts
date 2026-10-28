/**
 * The company that operates this instance, for the legal pages. Set in the
 * server's environment (read per request, so the pages are rendered
 * dynamically), never in the code:
 *
 *   LEGAL_ENTITY_NAME          e.g. "Example Ltd."
 *   LEGAL_ENTITY_REGISTRATION  e.g. "registration number: 12345678"
 *   LEGAL_ENTITY_COUNTRY       e.g. "Ireland" (country of incorporation)
 *
 * Unset, the pages say "the operator of this service" and leave the rest out.
 */

export type LegalEntity = {
  /** False when LEGAL_ENTITY_NAME isn't set. */
  configured: boolean;
  name: string;
  registration: string | null;
  country: string | null;
};

function setting(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function legalEntity(): LegalEntity {
  const name = setting("LEGAL_ENTITY_NAME");
  return {
    configured: name !== null,
    name: name ?? "the operator of this service",
    registration: setting("LEGAL_ENTITY_REGISTRATION"),
    country: setting("LEGAL_ENTITY_COUNTRY"),
  };
}

/** "Example Ltd. (registration number: 12345678)", or just the name. */
export function legalEntityWithRegistration(entity = legalEntity()): string {
  return entity.registration ? `${entity.name} (${entity.registration})` : entity.name;
}

/** The first letter capitalized, for a sentence or line that starts with the name. */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Ends a sentence with the text, without doubling a final period ("Example Ltd."). */
export function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}
