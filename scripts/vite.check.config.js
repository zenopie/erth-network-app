import { defineConfig } from 'vite';

// Bundles one check file, scripts/checks/$CHECK.mjs, with every dependency
// inlined so it runs under plain node: the chain layer gets runnable checks
// without a test framework. See scripts/check.sh.
const name = process.env.CHECK;
if (!name || !/^[a-z-]+$/.test(name)) throw new Error('set CHECK to a scripts/checks/<name>.mjs name');

export default defineConfig({
  build: {
    ssr: `scripts/checks/${name}.mjs`,
    outDir: `build-check/${name}`,
    emptyOutDir: true,
    target: 'node18',
  },
  ssr: { noExternal: true, target: 'node' },
});
