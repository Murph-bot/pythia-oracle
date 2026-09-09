# PYTHIA v2 — Agent Working Notes

## Verify before reporting

1. Syntax: `node --check functions/api/chat.js` + extract inline `<script>` from
   `index.html` and `node --check` it.
2. Function logic without auth: stub `env.AI` + `caches` and invoke
   `onRequestPost` with a `Request` (see tests below / manual node script).
3. Full round-trip requires `npx wrangler pages dev .` or a live deploy.
4. Browser checks: Playwright against the deployed URL — chat round-trip,
   easter eggs (`surprise`, `freelance`), localStorage persistence on reload,
   zero console errors, 390px mobile viewport.

## Known blockers / gotchas

- **Deploy needs auth**: `npx wrangler login` (browser OAuth) — only the user
  can do this. Everything else works without it.
- **Free-plan model access**: some models 403 on the free plan (error 5035).
  Default `@cf/meta/llama-3.2-3b-instruct` is free-tier safe (verified against
  the catalog 2026-09). Upgrade: `PYTHIA_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`.
- **Neuron budget**: 10,000/day free, resets UTC midnight. Exhaustion → error
  `3036` from `env.AI.run` → mapped to a graceful `429` in the function.
- **Rate limiting is edge-local** (Cache API) — approximate, fail-open. Fine
  for MVP; real global limits need Workers Rate Limiting API or Durable Objects.
- **LLM output is untrusted**: always render via `textContent`; never innerHTML.
- **History dedup**: the client echoes the user's message into the log *before*
  building `history`, so `route()` slices it off (`entries.slice(0, -1)`).
- `wrangler.toml` needs `pages_build_output_dir = "."` for Pages deploys; the
  AI binding lives under `[ai] binding = "AI"`.
