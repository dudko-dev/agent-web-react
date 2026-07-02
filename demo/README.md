# agent-web-react — demo

A Vite + React app showcasing [`@dudko.dev/agent-web-react`](../): an in-browser
LLM agent that edits a sticky-notes board through tools. Pick a cloud model
(bring your own key, stored encrypted) or load a local WebGPU model — everything
runs in the browser.

**Live:** https://dudko-dev.github.io/agent-web-react/

## Run locally

```bash
# from the repo root — build the library the demo consumes
npm install && npm run build

# then the demo
cd demo
npm install
npm run dev
```

The demo aliases `@dudko.dev/agent-web-react` to the built `../dist` (see
[`vite.config.ts`](vite.config.ts)), so re-run `npm run build` in the repo root
after editing the library source.

## Deployment

Pushed to GitHub Pages automatically by
[`../.github/workflows/deploy-demo.yml`](../.github/workflows/deploy-demo.yml).
The Vite `base` is `/agent-web-react/` to match the project-pages URL; override
it with the `DEMO_BASE` env var if you fork under a different repo name.
