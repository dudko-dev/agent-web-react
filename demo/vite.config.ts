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
    // The library in ../dist resolves its peers from the repo root's
    // node_modules; force ONE copy of each (two Reacts break every hook).
    dedupe: ['react', 'react-dom', '@dudko.dev/agent-web', 'ai', 'zod'],
    alias: [
      { find: '@dudko.dev/agent-web-react/styles.css', replacement: at('../dist/styles.css') },
      { find: '@dudko.dev/agent-web-react', replacement: at('../dist/index.js') },
    ],
  },
  // The chess analysts run as module Web Workers (`new Worker(new URL(…), {
  // type: 'module' })`) that import the agent core — they need ES output.
  worker: { format: 'es' },
  // WebLLM and the PDF converter ship their own wasm (found next to their JS
  // via `new URL(…, import.meta.url)`) and must not be pre-bundled.
  optimizeDeps: {
    exclude: ['@browser-ai/web-llm', '@mlc-ai/web-llm', '@dudko.dev/pdf-to-md-core'],
  },
})
