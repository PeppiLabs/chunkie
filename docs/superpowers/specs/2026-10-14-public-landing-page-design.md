# Public landing page in front of the password gate

Date: 2026-10-14
Status: approved in conversation, awaiting review of this written spec

## Goal

Visitors see the landing page without a password. The password is asked for
only when they open the visualizer. Everything else stays behind the password.
This holds both for `npm run dev` and for the built site on Render
(`npm start`, which runs `vite preview`).

Today the server password gate (`server/passwordGate.ts`) blocks every request,
including the landing page, which is a view inside the same React bundle as the
visualizer.

## Pages and URLs

| URL | Shows | Password |
|---|---|---|
| `/` | Landing page, with the same header and footer as today | No |
| `/app/` | Visualizer (load, chunk, embed, search) | Yes |
| `/app/#login`, `/app/#register`, `/app/#forgot-password` | In-app auth pages | Yes |
| `/healthz` | `ok` | No (unchanged) |
| Anything else (`/concepts.html`, `/samples/*`, workers, model files, the app bundle) | As today | Yes |

- "Launch visualizer" on the landing page goes to `/app/`. The gate shows the
  password form there, and a correct password lands the visitor in the
  visualizer, since the form posts back to the page that was asked for.
- "Sign up" and "Log in" go to `/app/#register` and `/app/#login`.
- The app no longer has a landing view. It opens on the visualizer. The
  header's "Overview" and the auth page's "Back" go to `/`. Old in-app hashes
  `#overview`, `#landing` and `#home` send the browser to `/`.
- `/logout` clears the session and redirects to `/`, which is now the landing
  page.
- The landing page reuses the existing `Header` and `Footer`, so `Header`'s
  dependencies (`AuthContext`, `authService`, `Logo`, `Button`) are public. They
  keep accounts in the browser's localStorage and hold no secrets. No
  visualizer code is in the landing bundle.

## How the gate decides what is public

`createPasswordGate` takes a new option, `isPublic(pathname): boolean`. A `GET`
or `HEAD` request whose pathname is public is passed on without a session.
Everything else keeps today's behaviour, and a `POST` to any path, public or
not, is still a login attempt.

Order of checks: `/healthz`, `/logout`, valid session, public path, login POST,
login form or 401.

### Built site (`vite preview`, Render)

At preview server start, the gate reads `<outDir>/.vite/manifest.json` (enabled
with `build.manifest: true`). From the `index.html` entry it collects the entry
file, its `css` and `assets` (the fonts), and the same three fields of every
chunk reached through `imports`, recursively. Public set: those files, plus
`/`, `/index.html` and `/favicon.svg`.

The `app/index.html` entry, its chunks, and the embedding and PDF workers are
not in the public set unless the landing entry imports them, which it does not.

If the manifest is missing, unreadable, or has no `index.html` entry, the
public set is empty and the gate logs a warning. The site stays fully
password-protected, so a broken build never exposes anything.

### Dev server (`vite`)

Vite serves source modules one at a time, so the public set is:

- `/`, `/index.html`, `/favicon.svg`
- Vite's client runtime: `/@vite/client`, `/@vite/env`, `/@react-refresh`
- Three package folders: `/node_modules/.vite/deps/` (Vite's pre-bundled
  packages, such as React), `/node_modules/@fontsource-variable/` (the fonts)
  and `/node_modules/vite/dist/client/` (Vite's client runtime, which
  `/@vite/client` imports). Nothing else under `/node_modules/`: it also holds
  cache files such as `.package-lock.json` and build info.
- The landing page's own source files: `src/landing.tsx` and every file reached
  from it by relative `import`/`export ... from`/side-effect `import`
  statements, resolved with the extensions `.ts`, `.tsx`, `.css` and
  `/index.*`. Bare package imports are skipped. The walk is redone on each
  request for a `/src/` path, so editing the landing page needs no restart.

If the walk proves too narrow in practice (for example Vite requests a module
under `/@id/`), only the specific path Vite needs is added, and the reason is
written beside it.

### Path safety

- The public list is consulted only when the whole request target, query
  included, is already canonical. It must contain no `%`, `\` or `#`, must be
  unchanged by `path.posix.normalize` (so no `.` or `..` segments and no `//`
  anywhere), and its path part must equal the pathname `new URL()` parses.
  Both checks are needed. Node 22.14's URL parser leaves `..` unresolved after
  a segment that starts with a dot (`/node_modules/.vite/deps/../../../src/App.tsx`
  parses unchanged). Vite's dev server normalises the query as part of the
  path (`/src/landing.tsx?/../App.tsx` becomes `/src/App.tsx`).
- Public paths are exact matches, except the three package folders in dev.
- Known cost: a landing-page link whose query holds `%` or `//` (for example
  `?utm_campaign=spring%20sale` or `?ref=https://x.com`) gets the password page
  instead of the landing page. It fails closed.

### Unchanged

`/healthz`, `/logout`, the 3-hour session, the 5-attempt lockout, Render's
`CF-Connecting-IP` handling, and the WebSocket upgrade guard. The hot-reload
socket stays password-only.

Known risk: on the public landing page in dev, Vite's client cannot open the
hot-reload socket. This must only log a console error and not loop page
reloads. If it loops, stop and decide with the user, rather than open the
socket.

## Changes by file

| File | Change |
|---|---|
| `index.html` | Landing entry. Loads `/src/landing.tsx`. |
| `app/index.html` (new) | Visualizer entry. Loads `/src/main.tsx`. Same head as today's `index.html`. |
| `src/landing.tsx` (new) | Imports the fonts and `index.css` as `main.tsx` does. Renders `AuthProvider` > `Header` (`currentView="landing"`), `LandingPage`, `Footer`. Navigation goes to `/app/`, `/app/#login`, `/app/#register`. |
| `src/App.tsx` | Drop the landing view. Default view `pipeline`. Landing navigation and `#overview`/`#landing`/`#home` go to `/`. |
| `src/lib/samples.ts` | Sample paths use `import.meta.env.BASE_URL + 'samples/...'`, so they work from `/app/`. |
| `public/concepts.html` | "Open the visualizer" links (two) point to `/app/`. The wordmark still links to `/`. |
| `vite.config.ts` | `appType: 'mpa'`. `build.rollupOptions.input` with both HTML files. `build.manifest: true`. Passes the project root (dev) and `outDir` (preview) to the gate plugin. |
| `server/passwordGate.ts` | `isPublic` option. Helpers `landingPathsFromManifest(manifest)` and `landingSourcePaths(root, entry)`. The plugin builds the dev or preview public set and passes it in. |
| `README.md` | "The site password" section and the file layout describe the public landing page and `/app/`. |

`/app` without a trailing slash must reach the visualizer in dev, preview and
the Windows launcher. Vite's `mpa` handling is checked during implementation,
and a redirect from `/app` to `/app/` is added in the gate only if needed. The
Go launcher already serves `app/index.html` for `/app/` through
`http.FileServer`.

## Testing

Written before the code, in `server/__tests__/passwordGate.test.ts`:

- A public `GET` and `HEAD` pass with no cookie.
- A `POST` to `/` is still treated as a login attempt.
- `/app/`, an app bundle script, `/concepts.html` and `/samples/x.json` still
  get the login form (HTML) or 401 (other requests).
- `%`, `\` and `..` paths that would leave the public set are refused.
- `landingPathsFromManifest` returns the landing entry, its shared imports, CSS
  and fonts. It never returns the app entry or workers, and it returns an empty
  set for a missing or malformed manifest.
- `landingSourcePaths` follows relative imports, including CSS and
  side-effect imports, and skips package imports.

Manual checks in a browser, signed out, for both `npm run dev` and
`npm run build && npm start`:

- `/` loads fully, with no 401 responses in the network panel.
- `/app/` shows the password form. After the password, the visualizer opens,
  a sample loads, and embedding runs (worker reachable).
- In dev, the landing page does not reload in a loop.

Then the full test suite, `tsc -b`, and lint. Lint already fails on 15
errors from the merged `origin/Updated` code. Those are reported separately
and not fixed as part of this change.

## Out of scope

- Fixing the existing lint errors.
- Making `/concepts.html` or the samples public.
- Search-engine indexing settings for the public landing page.
