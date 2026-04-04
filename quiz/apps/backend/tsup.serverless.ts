import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/vercel.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist/serverless',
  // Bundle everything except mongodb (has CJS dynamic requires of Node builtins)
  noExternal: [/^(?!mongodb)/],
  clean: true,
})
