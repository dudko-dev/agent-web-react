import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// React, react-dom and the core agent are peers — never bundled. Consumers
// bring their own React and install @dudko.dev/agent-web (which in turn
// dynamically imports only the model providers it needs).
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@dudko.dev/agent-web',
  '@dudko.dev/agent-web/mcp',
  'ai',
  'zod',
]

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: EXTERNAL,
  esbuildOptions(options) {
    // Emit the classic-free automatic JSX runtime so the bundle never assumes a
    // global `React` in scope.
    options.jsx = 'automatic'
  },
  // The stylesheet is optional and framework-agnostic; ship it verbatim next to
  // the JS so hosts can `import '@dudko.dev/agent-web-react/styles.css'`.
  onSuccess: async () => {
    copyFileSync('src/styles.css', 'dist/styles.css')
  },
})
