# Unsplash Viewer — Sample CMS UI Extension

Sample OCP app demonstrating how to build a **CMS UI extension** for
Optimizely CMS. Fork this repository as the starting point for your own
extension.

> **Beta:** the CMS UI extension SDK is in beta. APIs may change.

## What this app does

The included demo adds an Unsplash photo search panel to the CMS sidebar.
Editors type a query, browse results, view photo metadata, and copy image
URLs to the clipboard. It exercises the full extension surface — sidebar UI,
backend proxy, settings form, and credential validation — so you can see how
the pieces fit together.

## Architecture

```
┌─────────────────────────┐    invokeFunction({action, params})
│  CMS sidebar (iframe)   │ ───────────────────────────────────┐
│  src/cms-ui-extensions  │                                    │
└─────────────────────────┘                                    ▼
                                              ┌──────────────────────────┐
                                              │  Backend function (OCP)  │
                                              │  src/backend/functions   │
                                              └────────────┬─────────────┘
                                                           │ HTTPS + Access Key
                                                           ▼
                                                  ┌──────────────────┐
                                                  │  Third-party API │
                                                  │  (Unsplash)      │
                                                  └──────────────────┘
```

- **Sidebar UI** (`src/cms-ui-extensions/UnsplashViewer.sidebar.tsx`) — runs
  inside the CMS iframe. This sample uses plain DOM to keep the bundle small
  and the example dependency-free, but the UI bundle is just a standard Vite
  build — you can use React, Vue, Svelte, or any framework of your choice.
  Add it to `package.json`, update `vite.ui.config.mjs` as needed, and
  mount your root component from the sidebar entry point. Talks to the
  backend via `context.extension.invokeFunction()`.
- **Backend function** (`src/backend/functions/CmsUiExtension.ts`) — runs on
  the OCP platform. Holds credentials, proxies to the external API. Uses an
  action-router pattern: the UI sends `{action, params}`; the function
  switches on `action` and returns a standardized
  `{ok: true, result}` / `{ok: false, error}` envelope.
- **Unsplash client** (`src/backend/lib/unsplash.ts`) — thin HTTP wrapper
  around `api.unsplash.com`. Replace with your own service client.
- **Lifecycle hooks** (`src/backend/lifecycle/Lifecycle.ts`) — validates the
  Access Key server-side via `onSettingsForm` before saving.
- **Settings form** (`forms/settings.yml`) — per-install credentials.

**Why a backend proxy?** API keys never reach the browser, no CORS to
configure, and auth/rate-limit handling lives in one place.

## Demo-specific vs. boilerplate

When forking, **replace these** (demo-specific to Unsplash):

- `src/backend/lib/unsplash.ts` — swap for your own API client.
- `src/cms-ui-extensions/UnsplashViewer.sidebar.tsx` — your sidebar UI.
- The `search` / `trackDownload` actions in
  `src/backend/functions/CmsUiExtension.ts` — your action set.
- Credential fields in `forms/settings.yml` — your settings shape.
- The `APP_ENV_UNSPLASH_ACCESS_KEY` environment variable in `app.yml`.

**Keep these** (reusable boilerplate any CMS UI extension needs):

- The function envelope + error-handling pattern in `CmsUiExtension.ts`.
- The lifecycle settings-validation flow in `Lifecycle.ts`.
- DOM helpers under `src/cms-ui-extensions/common/`.
- Build configs: `vite.backend.config.mjs`, `vite.ui.config.mjs`,
  `ocp-app.config.mjs`.
- The overall `src/` layout (`backend/`, `cms-ui-extensions/`, `shared/`).

## Fork checklist

1. In `app.yml`, update `meta`: `app_id`, `display_name`, `summary`,
   `vendor`, `version`, `categories`.
2. In `app.yml`, rename the function (`cms_extension` /
   `entry_point: CmsUiExtension`) and the sidebar extension
   (`name: unsplash-viewer` / `entry_point: UnsplashViewer`,
   `display_name`) to match your domain.
3. Rename the matching files under `src/backend/functions/` and
   `src/cms-ui-extensions/` to match the new `entry_point` values.
4. Update `name` (and any other identifying fields) in `package.json`.
5. Replace the assets in `assets/` (icon, logo, `directory/overview.md`).
6. Update `forms/settings.yml` with your own credential fields, and update
   the `environment:` list in `app.yml` to your env var name.
7. Replace the Unsplash client and the action handlers; wire your UI to
   the new actions.

## Configuration

The Unsplash Access Key is resolved in this order:

1. The `credentials.accessKey` value from the app settings form (per install).
2. The `APP_ENV_UNSPLASH_ACCESS_KEY` environment variable (platform-wide
   default).

Create an Access Key at https://unsplash.com/developers.

## Commands

```bash
yarn install
yarn build         # vite build: backend bundle + UI bundle
yarn lint
yarn typecheck
yarn test          # placeholder — no tests defined
yarn validate      # lint + typecheck + build + ocp-app-sdk validate
```

## Further reading

- `@zaiusinc/ocp-cms-ui-extensions-app-sdk` — OCP plugin that wires CMS UI
  extensions into the app build (`ocp-app.config.mjs`).
- `@optimizely/cms-extensions-sdk` — runtime SDK used inside the sidebar
  bundle to talk to the CMS host (`context.extension.invokeFunction`, etc.).
- `@zaiusinc/app-sdk` — base classes for backend functions and lifecycle
  hooks (`App.Function`, `App.Lifecycle`, `App.Response`).
