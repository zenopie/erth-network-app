import { defineConfig } from 'vite';

// Bundles scripts/check-privacy.mjs with all deps inlined so it runs under
// plain node; see scripts/check-privacy.sh.
export default defineConfig({
  build: { ssr: 'scripts/check-privacy.mjs', outDir: 'build-check', emptyOutDir: true, target: 'node18' },
  ssr: { noExternal: true, target: 'node' },
});
