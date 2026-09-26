# PYTHIA — The Oracle of Delphi, reincarnated as a website

A public, AI-powered oracle. Any visitor can speak to her; she answers with
wit, wisdom, and the occasional Greek maxim. Powered by Cloudflare Pages +
Workers AI — **entirely on the free tier, no API keys needed**.

- Live: https://pythia-oracle.pages.dev
- Built by: Sotirios Goulas ([sotiriosgoulas.com](https://sotiriosgoulas.com))

## How it works

```
Browser (index.html — vanilla, zero build, static = unlimited/free)
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
  `create`, `help`, `clear`) still work as hidden easter eggs.
- Memory: the conversation lives in the visitor's own browser (localStorage).
  The server keeps nothing.
- Security: no secrets exist in the client. The Workers AI binding is
  account-scoped. LLM replies are rendered as plain text (never HTML).

## Local development

```bash
npx wrangler pages dev .     # serves the site + functions locally
npm test                     # unit tests for functions/api/chat.js
```

## Deploy

```bash
npx wrangler login           # one-time browser auth
npx wrangler pages deploy .  # creates/updates the pythia-oracle project
```

The AI binding comes from `wrangler.toml` (`[ai] binding = "AI"`).

## Free-tier budget (roughly)

- **Neurons**: 10,000/day free. `gemma-4-26b-a4b-it` costs about 10-13 neurons
  per reply → roughly 800 replies/day. When spent, the Oracle replies with a
  graceful "the fire is low, return at dawn" until UTC midnight.
- **Requests**: static assets are unlimited; `/api/chat` counts against the
  100k/day Workers free quota — far beyond MVP needs.
- **Rate limit**: 20 messages / 10 minutes per visitor (Cache API, edge-local).

### Model chain

`PYTHIA_MODEL` (env var, optional) is tried first if set, then
`@cf/google/gemma-4-26b-a4b-it`, then `@cf/meta/llama-3.2-3b-instruct` as a
fallback. Upgrade path if the site gets popular: Workers Paid ($5/mo) removes
the practical effect of the daily neuron cap.

## Project structure

```
index.html                 the temple (frontend, single file)
functions/api/chat.js      the mouthpiece (Pages Function)
wrangler.toml              Pages config + AI binding
```
