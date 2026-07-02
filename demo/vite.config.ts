import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The demo consumes the freshly built library from ../dist (run `npm run build`
// in the repo root first — CI does this before the demo build). Aliasing to the
// real dist keeps the demo honest: it exercises the published artifact, not the
// TypeScript source.
export default defineConfig({
  // Served at https://<user>.github.io/agent-web-react/ on GitHub Pages.
  base: process.env.DEMO_BASE ?? '/agent-web-react/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@dudko.dev/agent-web-react/styles.css', replacement: at('../dist/styles.css') },
      { find: '@dudko.dev/agent-web-react', replacement: at('../dist/index.js') },
    ],
  },
  // WebLLM ships its own workers/wasm and doesn't like being pre-bundled.
  optimizeDeps: {
    exclude: ['@browser-ai/web-llm', '@mlc-ai/web-llm'],
  },
})
