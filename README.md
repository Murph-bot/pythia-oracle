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
- Signed history: every reply carries an HMAC signature
  (`PYTHIA_HISTORY_SECRET`). The browser sends it back with the history, and
  the server drops any assistant turn whose signature does not match, so a
  visitor cannot forge earlier replies in which PYTHIA dropped her rules.
- Privacy: type `privacy` or use the footer link. The site stores no
  conversations; the chat lives in the visitor's browser and `clear` erases it.
  The only server-side state is per-IP rate-limit counters (expire within 24h)
  and one global daily reply count in KV.

## Local development

```bash
npm run dev                 # wrangler pages dev (pinned 4.148.0): site + functions
npm test                    # unit + static guards; npm run check / build:functions
```

## Deploy

```bash
npx wrangler login           # one-time browser auth
npm run deploy              # wrangler pages deploy (pinned), publishes public/ only
```

One-time secret for signed history (set it before deploying this code, or
PYTHIA forgets earlier replies in each conversation):

```bash
openssl rand -base64 32 | npx --yes wrangler@4.148.0 pages secret put PYTHIA_HISTORY_SECRET --project-name pythia-oracle
```

For `npm run dev`, put `PYTHIA_HISTORY_SECRET=<any string>` in `.dev.vars`
(gitignored).
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
  plus a global ceiling of 700 replies/day (`PYTHIA_DAILY_CAP`) counted in the
  `PYTHIA_KV` namespace bound in `wrangler.toml`. Keep the cap under KV's free
  1,000 writes/day.
- **History budget**: at most 4,000 chars of prior turns reach the model.
- **Origin**: cross-site browser POSTs to `/api/chat` get `403 BAD_ORIGIN`.
- **Body size**: requests over 128 KB get `413 TOO_LARGE`, cut off while
  streaming so an oversized upload is never read whole.

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
