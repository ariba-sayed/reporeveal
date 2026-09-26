# RepoReveal

> Paste any public GitHub repo and instantly get a file tree, tech-stack breakdown, language percentages, a newbie onboarding guide, and an AI assistant — powered by IBM Bob 2.0.

![RepoReveal](https://placehold.co/860x380/1b1b1b/8fd14f?text=RepoReveal+%E2%80%94+Overview+%7C+Get+Started+%7C+Explorer+%7C+Tech+Stack+%7C+Assistant&font=monospace)

---

## 🚀 Quick Start

```bash
git clone https://github.com/ariba-sayed/reporeveal.git
cd reporeveal

# Copy environment variables template
cp .env.example .env

# Edit .env with your actual credentials
nano .env
```

Verify `.env` is not tracked:

```bash
git status            # .env should NOT appear
git check-ignore -v .env   # should confirm it is ignored
```

Then serve locally:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`, type any public GitHub repo, click **Analyze**.

---

## What it does

| Tab | What you get |
|---|---|
| **Overview** | Stars, forks, language bars, recent commits, README excerpt |
| **🚀 Get Started** | Exact run commands, key files to read first, architecture flow diagram, contributor checklist |
| **Explorer** | Full file tree — click any file to preview its content and purpose |
| **Tech Stack** | Repo health scorecard, detected frameworks with confidence scores, full dependency table |
| **Assistant** | Ask anything about the repo — powered by IBM Bob 2.0 |

---

## How it works

Two analysis paths:

**Live repos** — type any `owner/repo`, click Analyze. The `/api/analyze` serverless function walks the GitHub Contents API, detects frameworks, parses dependencies, and returns structured JSON.

**Bundled demo** — type `local/reporeveal`. Loads [`data.json`](data.json), produced by IBM Bob IDE running 4 parallel subagents against this very repository.

```
Any public GitHub repo              "local/reporeveal"
        │                                   │
        ▼                                   ▼
  POST /api/analyze               fetch data.json
  (GitHub Contents API)           (Bob's pre-analysis)
        │                                   │
        └──────────────┬────────────────────┘
                       ▼
              same JSON schema
                       ▼
             index.html renders all tabs
```

---

## 🔒 Security

This project follows the IBM Hackathon security template guidelines.

**Before every commit:**
- [ ] Reviewed `git diff` for sensitive data
- [ ] No hardcoded API keys or passwords in source
- [ ] `.env` file is **not** in staged changes
- [ ] All credentials use environment variables

Environment variables used:

| Variable | Where | Description |
|---|---|---|
| `BOB_API_KEY` | Vercel env / `.env` | IBM Bob Inference API key |
| `GITHUB_TOKEN` | Vercel env / `.env` | GitHub PAT for higher rate limits |
| `BOB_API_URL` | Vercel env / `.env` | Bob endpoint URL (optional override) |
| `BOB_MODEL` | Vercel env / `.env` | Bob model name (optional override) |

The `.env` file is gitignored. Never commit real credentials — use `.env.example` as the template.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel
vercel env add BOB_API_KEY      # paste your Bob Inference key
vercel env add GITHUB_TOKEN     # paste your GitHub PAT
vercel --prod
```

Or via the **Vercel dashboard**: New Project → import `ariba-sayed/reporeveal` → Framework: **Other** → add env vars → Deploy.

**Getting a Bob API key:** [bob.ibm.com](https://bob.ibm.com) → subscription instance → **API key management** → **New key → Inference**. Copy the key and the endpoint URL on the same screen — set that URL as `BOB_API_URL` if it differs from the default.

---

## Rate limits

| Scenario | GitHub API limit |
|---|---|
| No `GITHUB_TOKEN` | 60 req/hr (~4 analyses/hr) |
| `GITHUB_TOKEN` set | 5,000 req/hr |
| Very large repos | May hit Vercel's 30s function timeout |

---

## File structure

```
reporeveal/
├─ index.html      # full SPA — 6 tabs, driven by data.json schema
├─ api/
│  ├─ analyze.js   # GitHub API → detects stack, deps, tests → returns JSON
│  └─ ask.js       # proxies Assistant questions to IBM Bob 2.0
├─ data.json       # Bob's pre-generated analysis of this repo
├─ .env.example    # template — copy to .env and fill in credentials
├─ .gitignore      # prevents committing .env and session files
└─ README.md
```

---

## 🆘 Need help?

- Read `SECURITY.md` for credential guidelines
- Ask in the hackathon Slack / mentor channel

---

## License

MIT
