/**
 * Where the two pages of the site live.
 *
 * The landing page is public. The visualizer sits behind the site password,
 * so every way into it is a link to APP_URL, never an in-page switch.
 */

/** The public landing page. */
export const LANDING_URL = '/';

/** The visualizer, behind the password. */
export const APP_URL = '/app/';

/**
 * Hashes that opened part of the app when it lived at the root. Old bookmarks
 * and shared links now land on the landing page, which sends them on.
 */
const APP_HASHES = new Set(['#visualizer', '#pipeline', '#app']);

/** Where an old `/#...` link should go now, or null to stay on the landing page. */
export function appUrlForLegacyHash(hash: string): string | null {
  const normalized = hash.toLowerCase();
  return APP_HASHES.has(normalized) ? `${APP_URL}${normalized}` : null;
}
