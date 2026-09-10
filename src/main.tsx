import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/*
 * Fonts are self hosted, so the app keeps working with no network and pulls in
 * no third party. Geist carries everything: it holds up at 60px for a headline
 * and stays legible at 12px in a label, so the page reads as one voice rather
 * than a pairing. Geist Mono handles the numbers.
 *
 * These are imported here rather than from index.css on purpose. Tailwind
 * resolves an @import itself, which leaves the relative url() references in
 * the font stylesheet unrewritten and the woff2 files never emitted. Going
 * through the bundler instead means the files are hashed, emitted and
 * correctly referenced.
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
