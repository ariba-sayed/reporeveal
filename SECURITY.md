# Security Guidelines

## Credentials in this project

This project uses the following secrets. **None of them should ever be committed to git.**

| Variable | Description |
|---|---|
| `BOB_API_KEY` | IBM Bob Inference API key |
| `BOB_API_URL` | Bob endpoint URL |
| `GITHUB_TOKEN` | GitHub Personal Access Token |

---

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in `.env` with your real values.
3. Confirm `.env` is ignored:
   ```bash
   git check-ignore -v .env   # should print: .gitignore:1:/.env  .env
   ```

The `.env` file is listed in `.gitignore` and `.bobignore` — it will never be staged or logged by AI assistants.

---

## Before every commit

- [ ] Run `git diff --staged` and check for API keys, tokens, or passwords
- [ ] `.env` does **not** appear in `git status`
- [ ] No hardcoded secrets in any source file
- [ ] All credentials are referenced via `process.env.VARIABLE_NAME`

---

## If you accidentally commit a secret

1. **Revoke the key immediately** — assume it is compromised the moment it hits GitHub.
   - Bob key: [bob.ibm.com](https://bob.ibm.com) → API key management → revoke
   - GitHub token: [github.com/settings/tokens](https://github.com/settings/tokens) → delete
2. Remove it from git history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch <file>" HEAD
   git push --force
   ```
3. Generate a new key and update your Vercel environment variables.
4. Notify the hackathon security team.

---

## Production secrets (Vercel)

Set environment variables in **Vercel → Project → Settings → Environment Variables**. They are injected at runtime and never stored in the repository.
