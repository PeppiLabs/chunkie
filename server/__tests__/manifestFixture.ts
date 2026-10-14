/**
 * A build manifest shaped like Vite's output for the two page build: the
 * landing page and the visualizer share a chunk, and the visualizer alone
 * carries the workers. The shared chunks import each other, as real ones can.
 */
export const BUILD_MANIFEST = {
  'index.html': {
    file: 'assets/landing-AAAA.js',
    src: 'index.html',
    isEntry: true,
    imports: ['_shared-BBBB.js'],
    css: ['assets/landing-CCCC.css'],
    assets: ['assets/geist-DDDD.woff2'],
  },
  'app/index.html': {
    file: 'assets/app-EEEE.js',
    src: 'app/index.html',
    isEntry: true,
    imports: ['_shared-BBBB.js'],
    css: ['assets/app-FFFF.css'],
    assets: ['assets/embedder.worker-GGGG.js', 'assets/pdf.worker.min-HHHH.mjs'],
  },
  '_shared-BBBB.js': {
    file: 'assets/shared-BBBB.js',
    css: ['assets/shared-IIII.css'],
    imports: ['_react-JJJJ.js'],
  },
  '_react-JJJJ.js': {
    file: 'assets/react-JJJJ.js',
    imports: ['_shared-BBBB.js'],
  },
};

/** Everything the landing page in BUILD_MANIFEST needs, and nothing else. */
export const LANDING_BUILD_PATHS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/assets/landing-AAAA.js',
  '/assets/landing-CCCC.css',
  '/assets/geist-DDDD.woff2',
  '/assets/shared-BBBB.js',
  '/assets/shared-IIII.css',
  '/assets/react-JJJJ.js',
];
