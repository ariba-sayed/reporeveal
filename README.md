# RepoReveal

> Paste any public GitHub repo and get a live breakdown of its file tree, tech stack (with confidence scores and evidence lines), language percentages, recent commits, and an AI assistant that answers questions about the code.

![RepoReveal tabs: Overview, Explorer, Tech Stack, Assistant](https://placehold.co/860x420/1b1b1b/8fd14f?text=RepoReveal+%E2%80%94+Overview+%7C+Explorer+%7C+Tech+Stack+%7C+Assistant&font=monospace)

---

## How it works

There are two analysis paths:

**Live repos** — type any `owner/repo` and click Analyze. The `/api/analyze` serverless function fetches the repo tree and key file contents via the GitHub API, runs rule-based framework detection, and returns the same JSON schema the frontend uses.

**Bundled demo** — type `local/reporeveal` (or leave it blank). The app loads [`data.json`](data.json), which was produced by IBM Bob IDE running 4 parallel subagents against this repository.

```
Any public GitHub repo          "local/reporeveal"
        │                               │
        ▼                               ▼
  POST /api/analyze            fetch data.json
  (GitHub Contents API)        (Bob's pre-analysis)
        │                               │
        └─────────────┬─────────────────┘
                      ▼
               same JSON schema
                      │
                      ▼
               index.html renders
         Overview · Explorer · Tech Stack · Assistant
```

The Assistant tab is pre-seeded with Q&A Bob produced while exploring this repo — matching questions resolve instantly. Novel questions fall through to the live `/api/ask` serverless function (requires `BOB_API_KEY`).

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
2. Type any public GitHub repo (`owner/repo` or a full `github.com/owner/repo` URL) and click **Analyze**.
3. All five tabs populate with live data:

| Tab | What you see |
|---|---|
| **Overview** | Stars, forks, description, language bars, recent commits, README excerpt |
| **Explorer** | Browsable file tree with inline code preview (first 60 lines per file) |
| **Tech Stack** | Detected frameworks with confidence %, evidence lines, security notes, build tools, package manifests |
| **Assistant** | Q&A about the repo — pre-seeded answers resolve instantly; new questions go to IBM Bob 2.0 |

**Quick-start chips:** click `facebook/react`, `vercel/next.js`, `django/django`, or `torvalds/linux` to analyze a well-known repo in one click.

Type `local/reporeveal` to load the bundled Bob-generated analysis from `data.json` (no API call, works offline).

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
   | `BOB_API_KEY` | optional | Bob Inference key — needed for live Assistant replies |
   | `GITHUB_TOKEN` | optional | GitHub PAT — raises analysis rate limit to 5k req/hr |
   | `BOB_API_URL` | optional | Override the default Bob endpoint |
   | `BOB_MODEL` | optional | Override `bob-2.0` |

5. Deploy. Visit your `*.vercel.app` URL and click **Analyze**.

> Env var changes require a redeploy to take effect. If you see a 500 about `BOB_API_KEY`, the variable isn't set yet.

**Getting a Bob API key:** log in at [bob.ibm.com](https://bob.ibm.com) → subscription instance → **API key management** → create an **Inference** key. Copy it immediately and copy the endpoint URL shown on the same screen.

---

## Rate limits

Each live analysis uses ~13–15 GitHub API calls (one recursive tree fetch + up to 12 file fetches).

| Scenario | Limit |
|---|---|
| No `GITHUB_TOKEN` | 60 requests/hr (unauthenticated) |
| `GITHUB_TOKEN` set | 5,000 requests/hr |
| Very large repos (linux, chromium) | Tree fetch may time out — Vercel default timeout is 10s |

---

## File structure

```
reporeveal/
├─ index.html        # full SPA — all five tabs, calls /api/analyze or loads data.json
├─ api/
│  ├─ analyze.js     # live GitHub API analysis → returns data.json-shaped JSON
│  └─ ask.js         # proxies Assistant questions to IBM Bob 2.0
├─ data.json         # Bob's pre-generated analysis of this repo (bundled demo)
└─ README.md
```

---

## License

MIT
