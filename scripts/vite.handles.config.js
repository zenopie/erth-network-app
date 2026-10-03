import { defineConfig } from 'vite';

// Bundles scripts/check-handles.mjs with all deps inlined so it runs under
// plain node; see scripts/check-handles.sh.
export default defineConfig({
  build: { ssr: 'scripts/check-handles.mjs', outDir: 'build-check', emptyOutDir: true, target: 'node18' },
  ssr: { noExternal: true, target: 'node' },
});
