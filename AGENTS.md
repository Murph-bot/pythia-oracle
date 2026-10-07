# PYTHIA v2 — Agent Working Notes

## Verify before reporting

1. Syntax: `node --check functions/api/chat.js && node --check public/app.js` (the client lives in
   public/app.js; index.html has no inline script so the CSP can stay strict).
2. `npm test` — unit tests for `functions/api/chat.js` (`test/chat.test.mjs`),
   stubbing `env.AI` + `caches`.
3. Full round-trip requires `npx wrangler pages dev` (reads public/ from wrangler.toml) or a live deploy.
4. Browser checks: Playwright against the deployed URL — chat round-trip,
   easter eggs (`surprise`, `freelance`), localStorage persistence on reload,
   zero console errors, 390px mobile viewport. Also check: the `prophecy`
   overlay appears and hides, `share` downloads/produces a PNG, Tab-completes
   an incantation name, and clicking one of the boot-time example questions
   submits it.

## Known blockers / gotchas

- **Modes table**: `functions/api/chat.js` has a `MODES` table (`chat`,
  `judge`, `fortune`, `create`, `prophecy`) that is the single source of
  truth for per-request `maxTokens`/`temperature` and, for every mode but
  `chat`, the fixed task text sent as the "message" (the visitor's own text
  is ignored for those modes). An unrecognized `mode` in the request body
  returns `400 BAD_MODE` before any AI call.
- **Prophecy log entries**: a `prophecy` reply is appended to the client log
  as a text entry with `p: 1` (no `r`, so it's never sent back as
  conversation history). `share` looks backwards through `entries` for the
  most recent `p === 1` entry and renders it to a PNG.
- **Clear-mid-reply epoch guard**: a module-level `epoch` counter in
  `public/index.html`, bumped by `clearLog()`. Every async reply path (chat, the
  AI-powered incantations, prophecy) captures `epoch` before it starts and
  checks it again wherever it would otherwise touch the DOM or append to
  `entries`; a mismatch means the slate was wiped mid-flight, so the path
  drops its output silently but still resets `thinking`/`busy`. `typeLine`
  itself also stops stepping once its element is no longer connected.
- **Reduced motion**: `matchMedia('(prefers-reduced-motion: reduce)')` is
  read once into `REDUCED`. Under it, `typeLine` sets full text immediately,
  the star field draws once statically (redrawn only on resize, no rAF
  loop), and `startOmega` is never called (surprise/prophecy still time the
  overlay reveal the same way, they just skip the star-formation animation).

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
- **Signed history**: `/api/chat` returns `{ reply, sig }` when
  `PYTHIA_HISTORY_SECRET` is set and the request carries a valid `cid` (32 lowercase hex chars). Each sig is a chain link: HMAC over `[cid, prev, mode, question, reply]`, where `prev` is the previous link's sig. The client keeps `cid` in localStorage (`pythia-v2-conversation`, reset by `clear`), stores `sig` as `g`, and sends `history`, `cid`, and `anchor` (the sig just before the 20-turn window). The server walks the chain from `anchor` and stops at the first broken link. Unpaired user turns are kept as sent. Visitors with entries from before this change lose their old replies from the model's view once. Their questions still reach the model.
- **Global cap is live**: `PYTHIA_KV` is bound in `wrangler.toml`.
- **Rate limiting is edge-local** (Cache API, fixed windows: 20/10 min and 100/day per IP) — approximate, fail-open. Pages cannot use the Workers Rate Limiting binding; the global cap is the optional `PYTHIA_KV` counter. Fine
  for MVP; real global limits need Workers Rate Limiting API or Durable Objects.
- **LLM output is untrusted**: always render via `textContent`; never innerHTML.
- **History role field**: log entries only carry an `r: 'user'|'assistant'`
  field on genuine conversation turns (the message sent to the oracle, and a
  successful reply). Commands, echoes, rate answers, and error/fallback lines
  have no `r`. `route()` builds the history to send from entries with `r`
  *before* echoing the new message, so the echo never ends up in its own
  history. Old localStorage logs predating this field just contribute no
  history — no migration needed.
- `wrangler.toml` needs `pages_build_output_dir = "public"` for Pages deploys (only public/ is published; never point it at the repo root, which leaked AGENTS.md, tests, and config); the
  AI binding lives under `[ai] binding = "AI"`.
