/** The test update feed's public origin, as the deployment declares it. */

/**
 * Validate the public origin of the internal-test update feed.
 *
 * The updater carries NO built-in origin: the deployment declares it in the
 * target dotenv (`DOWNLOAD_TEST_ORIGIN`) and this function is the single place
 * that turns that value into the origin the transport, the qualification
 * manifest and the public read all pin. Keeping it here —instead of a literal in
 * the code— is what stops a release tool from pointing at a host nobody in this
 * repository owns.
 *
 * The value must be an absolute `https` URL whose path is empty: an origin with a
 * path, a query or a fragment is not a feed root, and a plain `http` origin would
 * send update material in the clear.
 *
 * @param value - the declared `DOWNLOAD_TEST_ORIGIN`, or undefined when the deployment declares none.
 * @returns the origin, normalized by the URL parser (no trailing slash, no path).
 * @throws when the value is missing or is not an absolute https origin.
 */
export function requireTestHttpOrigin(value: string | undefined): string {
  const raw = value?.trim() ?? ''
  if (raw.length === 0) {
    throw new Error('installed update: DOWNLOAD_TEST_ORIGIN is required; the test feed origin is declared by the deployment, not built into the code')
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('installed update: DOWNLOAD_TEST_ORIGIN must be an absolute URL')
  }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('installed update: DOWNLOAD_TEST_ORIGIN must be an https origin with no path, query, or fragment')
  }
  return parsed.origin
}
