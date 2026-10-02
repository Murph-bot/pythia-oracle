# PYTHIA — The Oracle of Delphi, reincarnated as a website

A public, AI-powered oracle. Any visitor can speak to her; she answers with
wit, wisdom, and the occasional Greek maxim. Powered by Cloudflare Pages +
Workers AI — **entirely on the free tier, no API keys needed**.

- Live: https://pythia-oracle.pages.dev
- Built by: Sotirios Goulas ([sotiriosgoulas.com](https://sotiriosgoulas.com))

## How it works

```
Browser (public/index.html — vanilla, zero build, static = unlimited/free)
   │  POST /api/chat  {message, history[]}
   ▼
Pages Function (functions/api/chat.js — Workers Free quota)
   │  validate → rate-limit (Cache API per IP) → system prompt → env.AI.run()
   ▼
Workers AI (@cf/google/gemma-4-26b-a4b-it, falls back to
            @cf/meta/llama-3.2-3b-instruct — 10,000 free neurons/day)
```

- Conversations: chat-first. Type anything — Pythia answers. The v1 terminal
  commands (`surprise`, `fortune`, `judge`, `freelance`, `skills`, `projects`,
  `create`, `help`, `clear`) still work as hidden easter eggs. `judge`,
  `fortune`, and `create` now ask the Oracle for a fresh AI answer each time,
  falling back to a canned line if the request fails.
- `prophecy` distills the conversation so far into a one-line fate, shown on
  the full-screen verdict overlay and spoken aloud; `share` renders the last
  prophecy as a PNG (native share sheet if available, otherwise a download).
- `voice` toggles whether ordinary chat replies are also spoken aloud
  (`judge`/`surprise`/`prophecy` always speak, regardless of this setting).
- Tab-completes any incantation name while typing in the terminal.
- Memory: the conversation lives in the visitor's own browser (localStorage).
  The server keeps nothing.
- Security: no secrets exist in the client. The Workers AI binding is
  account-scoped. LLM replies are rendered as plain text (never HTML).

## Local development

```bash
npm run dev                 # wrangler pages dev (pinned 4.146.0): site + functions
npm test                    # unit + static guards; npm run check / build:functions
```

## Deploy

```bash
npx wrangler login           # one-time browser auth
npm run deploy              # wrangler pages deploy (pinned), publishes public/ only
```

The AI binding comes from `wrangler.toml` (`[ai] binding = "AI"`).

## Free-tier budget (roughly)

- **Neurons**: 10,000/day free. `gemma-4-26b-a4b-it` costs about 10-13 neurons
  per reply → roughly 800 replies/day. When spent, the Oracle replies with a
  graceful "the fire is low, return at dawn" until UTC midnight.
- **Requests**: static assets are unlimited; `/api/chat` counts against the
  100k/day Workers free quota — far beyond MVP needs.
- **Rate limit**: 20 messages / 10 minutes per visitor (Cache API, edge-local).
- **Daily caps**: 100 AI replies per visitor per UTC day (Cache API, edge-local),
  plus an optional global ceiling (default 700/day, `PYTHIA_DAILY_CAP`) once a
  `PYTHIA_KV` namespace is bound (see `wrangler.toml`).
- **History budget**: at most 4,000 chars of prior turns reach the model.
- **Origin**: cross-site browser POSTs to `/api/chat` get `403 BAD_ORIGIN`.

### Model chain

`PYTHIA_MODEL` (env var, optional) is tried first if set, then
`@cf/google/gemma-4-26b-a4b-it`, then `@cf/meta/llama-3.2-3b-instruct` as a
fallback. Upgrade path if the site gets popular: Workers Paid ($5/mo) removes
the practical effect of the daily neuron cap.

## Project structure

```
public/index.html          the temple (frontend, single file; only public/ is published)
functions/api/chat.js      the mouthpiece (Pages Function)
wrangler.toml              Pages config + AI binding
```
