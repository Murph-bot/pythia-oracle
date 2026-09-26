# PYTHIA v2 — Agent Working Notes

## Verify before reporting

1. Syntax: `node --check functions/api/chat.js` + extract inline `<script>` from
   `index.html` and `node --check` it.
2. `npm test` — unit tests for `functions/api/chat.js` (`test/chat.test.mjs`),
   stubbing `env.AI` + `caches`.
3. Full round-trip requires `npx wrangler pages dev .` or a live deploy.
4. Browser checks: Playwright against the deployed URL — chat round-trip,
   easter eggs (`surprise`, `freelance`), localStorage persistence on reload,
   zero console errors, 390px mobile viewport.

## Known blockers / gotchas

- **Deploy needs auth**: `npx wrangler login` (browser OAuth) — only the user
  can do this. Everything else works without it.
- **Free-plan model access**: some models 403 on the free plan (error 5035).
  The chain tries `@cf/google/gemma-4-26b-a4b-it` first, then falls back to
  `@cf/meta/llama-3.2-3b-instruct`. Override with `PYTHIA_MODEL`.
- **Gemma needs `enable_thinking: false`**: without that `chat_template_kwargs`
  flag, Gemma spends its whole token budget on hidden reasoning and returns
  `content: null`. It also answers in an OpenAI-shaped response
  (`res.choices[0].message.content`, `res.choices[0].finish_reason`), unlike
  Llama's `res.response`. `runModel` in `chat.js` reads both shapes.
- **Neuron budget**: 10,000/day free, resets UTC midnight. Exhaustion → error
  `3036` from `env.AI.run` → mapped to a graceful `429` in the function, and
  aborts the whole model chain (no point falling back — the budget is shared).
- **Rate limiting is edge-local** (Cache API) — approximate, fail-open. Fine
  for MVP; real global limits need Workers Rate Limiting API or Durable Objects.
- **LLM output is untrusted**: always render via `textContent`; never innerHTML.
- **History role field**: log entries only carry an `r: 'user'|'assistant'`
  field on genuine conversation turns (the message sent to the oracle, and a
  successful reply). Commands, echoes, rate answers, and error/fallback lines
  have no `r`. `route()` builds the history to send from entries with `r`
  *before* echoing the new message, so the echo never ends up in its own
  history. Old localStorage logs predating this field just contribute no
  history — no migration needed.
- `wrangler.toml` needs `pages_build_output_dir = "."` for Pages deploys; the
  AI binding lives under `[ai] binding = "AI"`.
