import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OCP_APP_CONFIG_BASENAMES } from '@zaiusinc/app-sdk';
import { defineConfig } from 'vite';

const cwd = path.dirname(fileURLToPath(import.meta.url));

const BACKEND_ROOT = 'src/backend';
const SHARED_ROOT = 'src/shared';
const OUT_DIR = 'dist';
const SOURCE_PATTERN = /\.(tsx?|jsx?)$/;
const SKIP_PATTERN = /\.(d\.ts|test\.tsx?|spec\.tsx?)$/;
const STATIC_ASSET_PATTERN = /\.(ya?ml|json)$/;

function discoverEntries() {
  const absRoot = path.resolve(cwd, BACKEND_ROOT);
  if (!existsSync(absRoot)) return {};

  const entries = {};
  const dirents = readdirSync(absRoot, {
    recursive: true,
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    if (!SOURCE_PATTERN.test(dirent.name) || SKIP_PATTERN.test(dirent.name))
      continue;
    const fullPath = path.join(dirent.parentPath, dirent.name);
    const rel = path.relative(absRoot, fullPath).replace(SOURCE_PATTERN, '');
    entries[rel] = fullPath;
  }
  return entries;
}

// vite-plugin equivalent of build.ts's static-file copying. Runs once after
// the bundle closes — keeps the manifest, ocp-app.config, top-level asset
// dirs, and any backend-side YAML/JSON resources alongside the CJS output
// where the OCP runtime expects them.
function copyAppArtifactsPlugin() {
  return {
    name: 'copy-app-artifacts',
    apply: 'build',
    closeBundle() {
      const out = path.resolve(cwd, OUT_DIR);
      mkdirSync(out, { recursive: true });

      copyIfPresent(path.resolve(cwd, 'app.yml'), path.join(out, 'app.yml'));
      for (const name of OCP_APP_CONFIG_BASENAMES) {
        if (copyIfPresent(path.resolve(cwd, name), path.join(out, name))) break;
      }

      copyTreeFiltered(
        path.resolve(cwd, BACKEND_ROOT),
        out,
        (rel) =>
          STATIC_ASSET_PATTERN.test(rel) &&
          !/(^|\/)(tsconfig|package)\.json$/.test(rel),
      );

      copyDirIfPresent(path.resolve(cwd, 'assets'), path.join(out, 'assets'));
      copyDirIfPresent(path.resolve(cwd, 'forms'), path.join(out, 'forms'));
    },
  };
}

function copyIfPresent(src, dest) {
  if (!existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function copyDirIfPresent(src, dest) {
  if (!existsSync(src) || !statSync(src).isDirectory()) return;
  cpSync(src, dest, { recursive: true });
}

function copyTreeFiltered(srcRoot, destRoot, predicate) {
  if (!existsSync(srcRoot)) return;
  const dirents = readdirSync(srcRoot, {
    recursive: true,
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    const fullPath = path.join(dirent.parentPath, dirent.name);
    const rel = path.relative(srcRoot, fullPath);
    if (!predicate(rel)) continue;
    const dest = path.join(destRoot, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(fullPath, dest);
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(cwd, SHARED_ROOT),
    },
  },
  // ssr: true tells Vite this is a server build — node_modules are
  // externalized by default, client-only transforms are skipped, and the
  // output is dual-targeted at Node.
  build: {
    target: 'node22',
    outDir: path.resolve(cwd, OUT_DIR),
    emptyOutDir: false,
    sourcemap: true,
    ssr: true,
    rollupOptions: {
      input: discoverEntries(),
      // Bare specifiers (anything not starting with '.' or absolute) are
      // resolved by Node at runtime against the deployed app's node_modules,
      // matching the original esbuild `packages: 'external'` behaviour.
      external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
      output: {
        format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: 'shared/[name]-[hash].js',
        exports: 'named',
      },
    },
  },
  plugins: [copyAppArtifactsPlugin()],
});
