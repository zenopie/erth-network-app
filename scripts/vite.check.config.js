import { defineConfig } from 'vite';

// Bundles scripts/check-explorer.mjs with all deps inlined so it can run under
// plain node, giving the chain layer a runnable check without a test framework.
export default defineConfig({
  build: {
    ssr: 'scripts/check-explorer.mjs',
    outDir: 'build-check',
    emptyOutDir: true,
    target: 'node18',
  },
  ssr: { noExternal: true, target: 'node' },
});
