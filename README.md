# RepoReveal

> Paste a GitHub repo URL and get an instant breakdown of its file tree, tech stack (with confidence scores and evidence lines), and an AI assistant that answers questions about the code — all powered by IBM Bob IDE.

![RepoReveal tabs: Overview, Explorer, Tech Stack, Assistant](https://placehold.co/860x420/1b1b1b/8fd14f?text=RepoReveal+%E2%80%94+Overview+%7C+Explorer+%7C+Tech+Stack+%7C+Assistant&font=monospace)

---

## How it works

Bob IDE runs 4 parallel subagents against a target repository and writes the results to [`data.json`](data.json). The app loads that file and renders every tab from it — Bob is the analysis engine, not a decoration.

```
Bob IDE (4 parallel subagents)
  ├─ file-tree          →  fileTree, fileContents, language breakdown
  ├─ tech-stack         →  frameworks[], confidence scores, evidence lines
  ├─ tests/CI           →  test files, CI config, deployment setup
  └─ doc-understanding  →  repo summary, README excerpt, seeded Q&A pairs
          │
          ▼
      data.json   ←  Bob's output (swap to re-analyze any repo)
          │
          ▼
      index.html  ←  reads data.json, populates every tab
```

The Assistant tab is pre-seeded with Q&A Bob produced while exploring the repo — matching questions resolve instantly with no inference call. Novel questions fall through to a live `/api/ask` serverless function.

---

## Installation

No build step or package manager required. Clone and serve:

```bash
git clone https://github.com/your-username/reporeveal.git
cd reporeveal
```

Then pick any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

---

## Usage

1. Open the app in your browser.
2. Type a repo name in the input field (e.g. `local/reporeveal`) and click **Analyze**.
3. The app fetches `data.json` and populates all five tabs:

| Tab | What you see |
|---|---|
| **Overview** | Repo description, language bars, commit log, README excerpt |
| **Explorer** | Browsable file tree with inline code preview |
| **Tech Stack** | Detected frameworks, build tools, package manifests — with confidence % and evidence lines |
| **Assistant** | Pre-seeded Q&A from Bob's analysis; live questions proxied to IBM Bob 2.0 |

### Re-analyzing a different repo

`data.json` is the only thing that changes between repos. Point Bob at any repository, run the 4-subagent pattern, write the output as `data.json`, and reload — all tabs update automatically.

---

## Deploy to Vercel

The live Assistant tab requires a Bob API key on the server. All other tabs work from `data.json` alone.

**Option A — Vercel CLI**

```bash
npm i -g vercel
vercel                          # first deploy, follow the prompts
vercel env add BOB_API_KEY      # paste your Inference key when prompted
vercel --prod
```

**Option B — GitHub + Vercel dashboard**

1. Push this repo to GitHub.
2. In Vercel: **New Project → import** that repo.
3. Framework preset: **Other** (static + one serverless function, no build step).
4. **Settings → Environment Variables** — add:

   | Variable | Required | Description |
   |---|---|---|
   | `BOB_API_KEY` | ✅ | Your Bob Inference API key |
   | `BOB_API_URL` | optional | Override the default Bob endpoint |
   | `BOB_MODEL` | optional | Override `bob-2.0` |

5. Deploy. Visit your `*.vercel.app` URL and click **Analyze**.

> Env var changes require a redeploy to take effect. If you see a 500 about `BOB_API_KEY`, the variable isn't set yet.

**Getting a Bob API key:** log in at [bob.ibm.com](https://bob.ibm.com) → subscription instance → **API key management** → create an **Inference** key. Copy it immediately and copy the endpoint URL shown on the same screen.

---

## File structure

```
reporeveal/
├─ index.html   # full SPA — all five tabs, reads from data.json
├─ ask.js       # Vercel serverless function — proxies live questions to IBM Bob 2.0
├─ data.json    # Bob's analysis output — the single source of truth for all tab content
└─ README.md
```

---

## License

MIT
