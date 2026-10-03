import { defineConfig } from 'vite';

// Bundles scripts/check-forms.mjs with all deps inlined so it runs under
// plain node; see scripts/check-forms.sh.
export default defineConfig({
  build: { ssr: 'scripts/check-forms.mjs', outDir: 'build-check', emptyOutDir: true, target: 'node18' },
  ssr: { noExternal: true, target: 'node' },
});
