---
description: Run the Pythia gate (syntax check and unit tests)
allowed-tools: Bash(npm run check), Bash(npm test)
---
Run in order and stop at the first failure:

1. `npm run check` (syntax-checks `functions/api/chat.js` and `public/app.js`)
2. `npm test` (unit tests for the chat function)

Then remind me the full round-trip and browser checks in AGENTS.md ("Verify before reporting")
still need `wrangler pages dev` or a live deploy.
