import { describe, expect, it } from 'vitest';
import { APP_URL, LANDING_URL, appUrlForLegacyHash } from '../siteUrls';

describe('site URLs', () => {
  it('puts the landing page at the root and the visualizer under /app/', () => {
    expect(LANDING_URL).toBe('/');
    expect(APP_URL).toBe('/app/');
  });

  it.each([
    ['#visualizer', '/app/#visualizer'],
    ['#pipeline', '/app/#pipeline'],
    ['#App', '/app/#app'],
  ])('sends an old %s link on to %s', (hash, url) => {
    expect(appUrlForLegacyHash(hash)).toBe(url);
  });

  // The site has no accounts of its own: the site password is the only sign-in,
  // so old account links have nowhere to go and stay on the landing page.
  it.each(['#login', '#register', '#signup', '#forgot-password', '#reset'])(
    'keeps the old account link %j on the landing page',
    (hash) => {
      expect(appUrlForLegacyHash(hash)).toBeNull();
    },
  );

  it.each(['', '#', '#overview', '#landing', '#home', '#how-it-works'])(
    'keeps %j on the landing page',
    (hash) => {
      expect(appUrlForLegacyHash(hash)).toBeNull();
    },
  );
});
