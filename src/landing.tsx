import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * The public landing page. Everything this file imports is served without the
 * site password (see server/publicPaths.ts), so the visualizer stays out of
 * it: every way into the app is a link to /app/, which asks for the password.
 *
 * The fonts and styles are imported here, as in main.tsx, for the reason given
 * there.
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { Footer } from './components/layout/Footer';
import { type AppView, Header } from './components/layout/Header';
import { LandingPage } from './components/pages/LandingPage';
import { APP_URL, appUrlForLegacyHash } from './lib/siteUrls';

const legacy = appUrlForLegacyHash(window.location.hash);
if (legacy) window.location.replace(legacy);

const openApp = () => window.location.assign(APP_URL);

function navigate(view: AppView) {
  if (view === 'landing') window.scrollTo({ top: 0, behavior: 'smooth' });
  else openApp();
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <div className="flex min-h-screen flex-col bg-ink-50">
      <Header currentView="landing" onNavigate={navigate} />
      <LandingPage onLaunchVisualizer={openApp} />
      <Footer />
    </div>
  </StrictMode>,
);
