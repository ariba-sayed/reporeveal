# RepoReveal

A repository analysis viewer **powered by IBM Bob IDE**. Bob ran 4 parallel subagents against this codebase — file tree, tech stack, tests/CI, and document understanding — and wrote [`data.json`](data.json). The app loads that file and renders it; Bob is the analysis engine, not a decoration.

## How it works

```
Bob IDE (4 parallel subagents)
  ├─ file-tree subagent      → fileTree, fileContents, languages, line counts
  ├─ tech-stack subagent     → frameworks[], confidence scores, evidence lines
  ├─ tests/CI subagent       → test files, CI config, deployment setup
  └─ doc-understanding agent → repo summary, README excerpt, seeded Q&A pairs
         │
         ▼
    data.json   ←  the output Bob actually generated
         │
         ▼
    index.html  ←  reads data.json, populates every tab
```

The Assistant tab is pre-seeded with Q&A Bob produced while exploring the repo. Clicking a chip or typing a matching question returns it instantly — no inference call needed. Novel questions fall through to the live `/api/ask` serverless function (requires `BOB_API_KEY`).

## File structure

```
reporeveal/
├─ index.html   # full SPA — all tabs read from data.json
├─ ask.js       # Vercel serverless function — proxies live questions to IBM Bob 2.0
├─ data.json    # Bob's analysis output — swap this to re-analyze any repo
└─ README.md
```

## Run locally

No build step. Serve the directory with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`, click **Analyze**, and all tabs populate from `data.json`.

## Deploy to Vercel

The live Assistant tab requires a Bob API key on the server. Everything else works from `data.json` alone.

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel                          # first deploy, follow the prompts
vercel env add BOB_API_KEY      # paste your Inference key when prompted
vercel --prod
```

### Option B — GitHub + Vercel dashboard

1. Push this repo to GitHub.
2. In Vercel: **New Project → import** that repo.
3. Framework preset: **Other** (static + one function, no build step).
4. **Settings → Environment Variables** — add:
   | Variable | Value |
   |---|---|
   | `BOB_API_KEY` | your Bob Inference key |
   | `BOB_API_URL` | *(optional)* override the default endpoint |
   | `BOB_MODEL` | *(optional)* override `bob-2.0` |
5. Deploy.

> **Note:** env var changes require a redeploy to take effect.

## Getting a Bob API key

1. Log in at [bob.ibm.com](https://bob.ibm.com).
2. Open your subscription instance → **API key management**.
3. Create a key of type **Inference**.
4. Copy the key immediately — you can't view it again.
5. Copy the endpoint URL shown on that same screen and set it as `BOB_API_URL` if it differs from the default in `ask.js`.

## Re-analyzing a different repo

`data.json` is the only thing that changes between repos. To analyze a new target:

1. Point Bob at the target repository.
2. Run the same 4-subagent analysis pattern (file tree, tech stack, tests/CI, doc understanding).
3. Write the output as `data.json` using the same schema.
4. Reload the app — all tabs update automatically.

## Security

- `BOB_API_KEY` lives in Vercel environment variables, never in source code.
- The browser only calls `/api/ask` on the same origin — it never contacts the Bob API directly.
- `ask.js` validates the HTTP method and request body before forwarding anything upstream.
