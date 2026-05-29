import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {UI_EXTENSION_INJECTION_POINTS} from '@optimizely/ocp-cms-ui-extensions-sdk';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

const cwd = path.dirname(fileURLToPath(import.meta.url));

const UI_SRC_ROOT = 'src/cms-ui-extensions';
const SHARED_ROOT = 'src/shared';
const UI_OUT_DIR = 'dist/cms-ui-extensions';
// Pattern: <basename>.<injection-point>.<ts|tsx|js|jsx> — e.g.
// `analytics-dashboard.sidebar.tsx`. The injection-point list is the SDK's
// source of truth so this regex stays in sync as new surfaces are added.
const ENTRY_PATTERN = new RegExp(
  `\\.(${UI_EXTENSION_INJECTION_POINTS.join('|')})\\.(tsx?|jsx?)$`
);

function discoverEntries() {
  const absRoot = path.resolve(cwd, UI_SRC_ROOT);
  if (!existsSync(absRoot)) return {};

  const entries = {};
  const dirents = readdirSync(absRoot, {recursive: true, withFileTypes: true});
  for (const dirent of dirents) {
    if (!dirent.isFile() || !ENTRY_PATTERN.test(dirent.name)) continue;
    const basename = dirent.name.replace(ENTRY_PATTERN, '');
    const fullPath = path.join(dirent.parentPath, dirent.name);
    if (entries[basename]) {
      throw new Error(`Duplicate UI extension entry point '${basename}': ${entries[basename]} and ${fullPath}`);
    }
    entries[basename] = fullPath;
  }
  return entries;
}

export default defineConfig({
  // Asset URLs are emitted as `new URL('./assets/foo-<hash>.svg', import.meta.url).href`
  // so each bundle resolves them against whatever CDN it's served from. `base`
  // alone doesn't achieve this in JS bundles, so renderBuiltUrl (officially
  // supported, namespaced as experimental) forces relative URLs.
  base: './',
  plugins: [react(), cssInjectedByJsPlugin()],
  experimental: {
    renderBuiltUrl: () => ({relative: true})
  },
  resolve: {
    alias: {
      '@shared': path.resolve(cwd, SHARED_ROOT)
    }
  },
  build: {
    outDir: path.resolve(cwd, UI_OUT_DIR),
    emptyOutDir: false,
    sourcemap: true,
    // Inline web fonts as data URIs so the CSS-in-JS bundle is self-contained
    // when served inside the CMS iframe (relative font URLs would 404). All
    // other assets keep landing as hashed files under dist/cms-ui-extensions/assets/.
    assetsInlineLimit: (filePath) => /\.(woff2?|ttf|otf|eot)$/i.test(filePath),
    // Emits dist/cms-ui-extensions/manifest.json mapping each source entry to
    // its built file plus referenced chunks/assets (with content hashes).
    // The OCP CDN uploader and discovery API enumerate bundles from this.
    manifest: 'manifest.json',
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: discoverEntries(),
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'shared/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
