/**
 * The `sector-legal` namespace: the legal pack's own voice.
 *
 * The namespace is the pack's, not the brand's: `@deepseek-ai/dsh-client-locale`
 * allows exactly one registrant per (namespace, locale) — a second
 * `register('helmcode', { es, en })` throws — and the Helmcode brand skin
 * already owns the `helmcode` namespace. A sector chip therefore carries its
 * own namespace so a deployment can mount the brand and this pack together
 * without either evicting the other.
 *
 * Spanish is the source of truth (the language this deployment speaks) and the
 * English dictionary is checked complete against its key set, so a key added to
 * one language is a compile error until it exists in the other.
 */

/** Spanish dictionary (the key-set source of truth). */
export const es = {
  // El chip de cabecera: el sector que el perfil compone.
  'sector.name': 'Legal',
} satisfies Record<string, string>

/** The `sector-legal` namespace key union. */
export type SectorKey = keyof typeof es

/** English dictionary, checked complete against the es key set. */
export const en = {
  'sector.name': 'Legal',
} satisfies Record<SectorKey, string>

/** Locale namespace owned by this package. */
export const NS = 'sector-legal'
