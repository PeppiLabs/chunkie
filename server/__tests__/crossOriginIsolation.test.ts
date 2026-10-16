import { describe, expect, it } from 'vitest';
import { crossOriginHeaders } from '../crossOriginIsolation';

describe('crossOriginHeaders', () => {
  it.each(['/app/', '/app/index.html', '/assets/embedder.worker-AAAA.js', '/concepts.html', '/healthz'])(
    'isolates %s',
    (pathname) => {
      expect(crossOriginHeaders(pathname)).toEqual({
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
    },
  );

  it.each(['/', '/index.html'])('leaves the embedder policy off the landing page at %s, for its YouTube player', (pathname) => {
    expect(crossOriginHeaders(pathname)).toEqual({ 'Cross-Origin-Opener-Policy': 'same-origin' });
  });
});
