// /api/analyze — serverless function (Node runtime on Vercel)
// Accepts: POST { repo: "owner/name" }
// Returns: the same data.json schema the frontend already knows how to render.
//
// Uses the GitHub Contents API (no cloning needed).
// Set GITHUB_TOKEN in Vercel env vars for 5k req/hr instead of 60.
// Set BOB_API_KEY if you want AI-generated descriptions (optional — falls back to rule-based).

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// ---- GitHub helpers -------------------------------------------------------

async function ghFetch(path) {
  const headers = { 'User-Agent': 'RepoReveal/1.0', 'Accept': 'application/vnd.github+json' };
  if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  const resp = await fetch(`https://api.github.com${path}`, { headers });
  if (resp.status === 403) throw { status: 403, message: 'GitHub rate limit hit. Set GITHUB_TOKEN env var for higher limits.' };
  if (resp.status === 404) throw { status: 404, message: `Not found: ${path}` };
  if (!resp.ok) throw { status: resp.status, message: `GitHub API error ${resp.status} on ${path}` };
  return resp.json();
}

// Fetch the flat git tree (recursive) — one API call for the whole repo
async function fetchTree(owner, repo, branch) {
  const data = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  return data.tree || []; // array of { path, type, size, sha, url }
}

// Fetch raw text of a single file (base64-decoded)
async function fetchFileContent(owner, repo, path) {
  try {
    const data = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
    if (data.encoding === 'base64' && data.content) {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch repo metadata
async function fetchRepoMeta(owner, repo) {
  return ghFetch(`/repos/${owner}/${repo}`);
}

// Fetch recent commits
async function fetchCommits(owner, repo, branch) {
  try {
    const commits = await ghFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=5`);
    return commits.map(c => ({
      message: c.commit.message.split('\n')[0].slice(0, 80),
      author: c.commit.author.name,
      ago: timeAgo(new Date(c.commit.author.date))
    }));
  } catch {
    return [];
  }
}

function timeAgo(date) {
  const secs = Math.floor((Date.now() - date) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + ' minutes ago';
  if (secs < 86400) return Math.floor(secs / 3600) + ' hours ago';
  if (secs < 86400 * 7) return Math.floor(secs / 86400) + ' days ago';
  return date.toISOString().slice(0, 10);
}

// ---- Analysis helpers ------------------------------------------------------

const LANG_MAP = {
  js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
  kt: 'Kotlin', swift: 'Swift', cs: 'C#', cpp: 'C++', c: 'C',
  html: 'HTML', css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS',
  md: 'Markdown', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  dockerfile: 'Docker', toml: 'TOML', xml: 'XML', sql: 'SQL',
  vue: 'Vue', svelte: 'Svelte', astro: 'Astro', php: 'PHP',
};

function ext(path) {
  const parts = path.split('.');
  if (parts.length < 2) return path.split('/').pop().toLowerCase(); // e.g. "Dockerfile"
  return parts.pop().toLowerCase();
}

function detectLanguages(tree) {
  const counts = {};
  let total = 0;
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const size = item.size || 0;
    const e = ext(item.path);
    const lang = LANG_MAP[e];
    if (lang && size > 0) {
      counts[lang] = (counts[lang] || 0) + size;
      total += size;
    }
  }
  if (total === 0) return [{ name: 'Unknown', pct: 100 }];
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 100) }))
    .filter(l => l.pct >= 1);
}

// Build the nested fileTree object from the flat git tree list
function buildFileTree(flatTree) {
  const root = {};
  for (const item of flatTree) {
    if (item.type !== 'blob') continue;
    const parts = item.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = ext(item.path);
  }
  return root;
}

// Pick the most interesting files to preview (config files, entry points, etc.)
const PRIORITY_FILES = [
  'package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
  'README.md', 'readme.md',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github/workflows/ci.yml', '.github/workflows/main.yml',
  'Makefile', 'vercel.json', 'netlify.toml', '.travis.yml',
  'tsconfig.json', '.eslintrc.json', '.eslintrc.js', 'jest.config.js',
  'src/index.js', 'src/index.ts', 'src/main.js', 'src/main.ts', 'src/app.js', 'src/app.ts',
  'index.js', 'index.ts', 'main.py', 'app.py', 'manage.py', 'server.js', 'server.ts',
];

function pickPreviewFiles(tree, max = 40) {
  // Only fetch files under 100 KB to avoid huge blobs
  const blobs = tree.filter(i => i.type === 'blob' && (i.size || 0) < 100_000);
  const paths = blobs.map(i => i.path);
  const picked = [];

  // 1. Priority config / entry-point files first
  for (const pf of PRIORITY_FILES) {
    if (paths.includes(pf) && !picked.includes(pf)) picked.push(pf);
    if (picked.length >= max) break;
  }

  // 2. Fill remaining slots — prefer small files, any recognised source extension
  const sorted = blobs
    .filter(i => !picked.includes(i.path))
    .sort((a, b) => (a.size || 0) - (b.size || 0)); // smallest first = faster fetches

  for (const item of sorted) {
    if (picked.length >= max) break;
    const e = ext(item.path);
    if (LANG_MAP[e]) picked.push(item.path);
  }

  return picked;
}

// ---- Framework / tech-stack detection -------------------------------------

const FRAMEWORK_RULES = [
  // name, confidence, test fn(fileSet, pkgJson), description fn
  {
    name: 'React',
    test: (f, p) => hasDep(p, 'react') || f.has('src/App.jsx') || f.has('src/App.tsx'),
    confidence: (f, p) => hasDep(p, 'react') ? 95 : 75,
    description: 'JavaScript library for building user interfaces. Detected via package.json dependency and/or JSX source files.',
    securityNote: (f, p) => {
      const v = depVersion(p, 'react');
      return v && parseInt(v) < 18 ? `React ${v} detected — consider upgrading to 18.x for security patches.` : null;
    },
    evidence: (f) => [
      f.has('package.json') ? 'package.json · react dependency' : null,
      f.has('src/App.jsx') ? 'src/App.jsx' : f.has('src/App.tsx') ? 'src/App.tsx' : null,
    ].filter(Boolean),
  },
  {
    name: 'Next.js',
    test: (f, p) => hasDep(p, 'next') || f.has('next.config.js') || f.has('next.config.ts'),
    confidence: () => 95,
    description: 'React framework with server-side rendering, static generation, and file-system routing.',
    securityNote: null,
    evidence: (f) => ['package.json · next dependency', f.has('next.config.js') ? 'next.config.js' : null].filter(Boolean),
  },
  {
    name: 'Vue.js',
    test: (f, p) => hasDep(p, 'vue') || f.has('vue.config.js'),
    confidence: () => 92,
    description: 'Progressive JavaScript framework for building user interfaces. Detected via package.json.',
    securityNote: null,
    evidence: () => ['package.json · vue dependency'],
  },
  {
    name: 'Svelte',
    test: (f, p) => hasDep(p, 'svelte') || f.has('svelte.config.js'),
    confidence: () => 92,
    description: 'Compiler-based UI framework that ships no runtime to the browser.',
    securityNote: null,
    evidence: () => ['package.json · svelte dependency'],
  },
  {
    name: 'Express',
    test: (f, p) => hasDep(p, 'express'),
    confidence: () => 88,
    description: 'Minimal Node.js web framework for defining HTTP routes and middleware.',
    securityNote: null,
    evidence: () => ['package.json · express dependency'],
  },
  {
    name: 'Fastify',
    test: (f, p) => hasDep(p, 'fastify'),
    confidence: () => 88,
    description: 'High-performance Node.js web framework with schema-based validation.',
    securityNote: null,
    evidence: () => ['package.json · fastify dependency'],
  },
  {
    name: 'Django',
    test: (f, _p, fc) => f.has('manage.py') || grepReqs(fc, 'requirements', 'django'),
    confidence: (f) => f.has('manage.py') ? 92 : 80,
    description: 'High-level Python web framework. Detected via manage.py and/or requirements.txt.',
    securityNote: (_f, _p, fc) => {
      const v = reqVersion(fc, 'requirements', 'django');
      return v && v.startsWith('3.') ? `Django ${v} may be near end-of-life — consider upgrading to 4.x LTS.` : null;
    },
    evidence: (f) => [f.has('manage.py') ? 'manage.py' : null, 'requirements.txt · Django dependency'].filter(Boolean),
  },
  {
    name: 'FastAPI',
    test: (f, _p, fc) => grepReqs(fc, 'requirements', 'fastapi'),
    confidence: () => 90,
    description: 'Modern, high-performance Python web framework with automatic OpenAPI docs.',
    securityNote: null,
    evidence: () => ['requirements.txt · fastapi dependency'],
  },
  {
    name: 'Flask',
    test: (f, _p, fc) => grepReqs(fc, 'requirements', 'flask'),
    confidence: () => 88,
    description: 'Lightweight Python WSGI web framework.',
    securityNote: null,
    evidence: () => ['requirements.txt · flask dependency'],
  },
  {
    name: 'TypeScript',
    test: (f) => f.has('tsconfig.json'),
    confidence: () => 97,
    description: 'Typed superset of JavaScript. tsconfig.json present at repo root.',
    securityNote: null,
    evidence: () => ['tsconfig.json'],
  },
  {
    name: 'Docker',
    test: (f) => f.has('Dockerfile') || f.has('docker-compose.yml') || f.has('docker-compose.yaml'),
    confidence: (f) => f.has('Dockerfile') ? 95 : 80,
    description: 'Containerisation tooling. Detected via Dockerfile and/or compose file.',
    securityNote: null,
    evidence: (f) => [
      f.has('Dockerfile') ? 'Dockerfile' : null,
      f.has('docker-compose.yml') ? 'docker-compose.yml' : f.has('docker-compose.yaml') ? 'docker-compose.yaml' : null,
    ].filter(Boolean),
  },
  {
    name: 'GitHub Actions',
    test: (f) => [...f].some(p => p.startsWith('.github/workflows/')),
    confidence: () => 94,
    description: 'CI/CD pipeline via GitHub Actions. Workflow files detected under .github/workflows/.',
    securityNote: null,
    evidence: (f) => [[...f].find(p => p.startsWith('.github/workflows/'))].filter(Boolean),
  },
  {
    name: 'Vite',
    test: (f, p) => hasDep(p, 'vite') || f.has('vite.config.js') || f.has('vite.config.ts'),
    confidence: () => 93,
    description: 'Fast frontend build tool and dev server.',
    securityNote: null,
    evidence: (f) => [f.has('vite.config.js') ? 'vite.config.js' : f.has('vite.config.ts') ? 'vite.config.ts' : 'package.json · vite dependency'],
  },
  {
    name: 'Tailwind CSS',
    test: (f, p) => hasDep(p, 'tailwindcss') || f.has('tailwind.config.js') || f.has('tailwind.config.ts'),
    confidence: () => 90,
    description: 'Utility-first CSS framework.',
    securityNote: null,
    evidence: (f) => [f.has('tailwind.config.js') ? 'tailwind.config.js' : 'package.json · tailwindcss dependency'],
  },
  {
    name: 'Vercel',
    test: (f) => f.has('vercel.json') || f.has('api/ask.js') || f.has('api/index.js'),
    confidence: () => 82,
    description: 'Serverless deployment platform. Detected via vercel.json or api/ directory.',
    securityNote: null,
    evidence: (f) => [f.has('vercel.json') ? 'vercel.json' : null, f.has('api/ask.js') ? 'api/ask.js' : null].filter(Boolean),
  },
  {
    name: 'Go modules',
    test: (f) => f.has('go.mod'),
    confidence: () => 97,
    description: 'Go module system detected via go.mod.',
    securityNote: null,
    evidence: () => ['go.mod'],
  },
  {
    name: 'Rust / Cargo',
    test: (f) => f.has('Cargo.toml'),
    confidence: () => 97,
    description: 'Rust project with Cargo build system.',
    securityNote: null,
    evidence: () => ['Cargo.toml'],
  },
];

function hasDep(pkgContents, name) {
  if (!pkgContents) return false;
  try {
    const p = JSON.parse(pkgContents);
    return !!(p.dependencies?.[name] || p.devDependencies?.[name]);
  } catch { return false; }
}

function depVersion(pkgContents, name) {
  if (!pkgContents) return null;
  try {
    const p = JSON.parse(pkgContents);
    const v = p.dependencies?.[name] || p.devDependencies?.[name] || '';
    return v.replace(/[^0-9.]/g, '').split('.')[0] || null;
  } catch { return null; }
}

function grepReqs(fileContents, file, name) {
  const c = fileContents[file] || fileContents[file + '.txt'] || '';
  return c.toLowerCase().includes(name.toLowerCase());
}

function reqVersion(fileContents, file, name) {
  const c = fileContents[file] || fileContents[file + '.txt'] || '';
  const m = c.match(new RegExp(name + '==([\\d.]+)', 'i'));
  return m ? m[1] : null;
}

function detectFrameworks(fileSet, fileContents) {
  const results = [];
  const pkg = fileContents['package.json'];
  for (const rule of FRAMEWORK_RULES) {
    if (rule.test(fileSet, pkg, fileContents)) {
      const conf = typeof rule.confidence === 'function'
        ? rule.confidence(fileSet, pkg, fileContents)
        : rule.confidence;
      const secNote = typeof rule.securityNote === 'function'
        ? rule.securityNote(fileSet, pkg, fileContents)
        : rule.securityNote;
      results.push({
        name: rule.name,
        confidence: conf,
        description: rule.description,
        securityNote: secNote || null,
        evidence: rule.evidence(fileSet, fileContents),
      });
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}

function detectBuildTools(fileSet, fileContents) {
  const tools = [];
  if (fileSet.has('.github/workflows') || [...fileSet].some(p => p.startsWith('.github/workflows/'))) {
    tools.push({ name: 'GitHub Actions', confidence: 94, description: 'CI/CD workflows detected.' });
  }
  if (fileSet.has('Makefile')) {
    tools.push({ name: 'Makefile', confidence: 80, description: 'Make-based build rules.' });
  }
  if (fileSet.has('.travis.yml')) {
    tools.push({ name: 'Travis CI', confidence: 72, description: '.travis.yml detected.' });
  }
  if (fileSet.has('circle.yml') || fileSet.has('.circleci/config.yml')) {
    tools.push({ name: 'CircleCI', confidence: 85, description: '.circleci/config.yml detected.' });
  }
  if (hasDep(fileContents['package.json'], 'vite') || fileSet.has('vite.config.js') || fileSet.has('vite.config.ts')) {
    tools.push({ name: 'Vite', confidence: 93, description: 'Frontend build tool.' });
  } else if (hasDep(fileContents['package.json'], 'webpack') || fileSet.has('webpack.config.js')) {
    tools.push({ name: 'Webpack', confidence: 87, description: 'Module bundler detected.' });
  }
  if (tools.length === 0) {
    tools.push({ name: 'No CI/build config detected', confidence: 99, description: 'No Makefile, CI yaml, or bundler config found at repo root.' });
  }
  return tools;
}

function detectManifests(fileSet, fileContents) {
  const manifests = [];
  if (fileSet.has('package.json') && fileContents['package.json']) {
    try {
      const p = JSON.parse(fileContents['package.json']);
      const deps = Object.keys({ ...p.dependencies, ...p.devDependencies }).slice(0, 6).join(', ');
      manifests.push({ name: 'package.json', path: 'package.json', summary: `Top deps: ${deps || '(none)'}` });
    } catch {
      manifests.push({ name: 'package.json', path: 'package.json', summary: 'Present but could not parse.' });
    }
  }
  if (fileSet.has('requirements.txt') && fileContents['requirements.txt']) {
    const top = fileContents['requirements.txt'].split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 5).join(', ');
    manifests.push({ name: 'requirements.txt', path: 'requirements.txt', summary: `Top packages: ${top}` });
  }
  if (fileSet.has('Cargo.toml')) {
    manifests.push({ name: 'Cargo.toml', path: 'Cargo.toml', summary: 'Rust package manifest.' });
  }
  if (fileSet.has('go.mod')) {
    manifests.push({ name: 'go.mod', path: 'go.mod', summary: 'Go module definition.' });
  }
  if (fileSet.has('pom.xml')) {
    manifests.push({ name: 'pom.xml', path: 'pom.xml', summary: 'Maven build descriptor.' });
  }
  if (manifests.length === 0) {
    manifests.push({ name: 'None detected', path: 'N/A', summary: 'No recognized package manifest found.' });
  }
  return manifests;
}

function detectTests(fileSet) {
  const testFiles = [...fileSet].filter(p =>
    p.includes('test') || p.includes('spec') || p.includes('__tests__') ||
    p.endsWith('.test.js') || p.endsWith('.test.ts') || p.endsWith('.spec.js') || p.endsWith('.spec.ts') ||
    p.startsWith('test_') || p.endsWith('_test.py') || p.endsWith('_test.go')
  ).slice(0, 10);

  let testCommand = 'no test suite detected';
  if (fileSet.has('package.json')) testCommand = 'npm test';
  if ([...fileSet].some(p => p.endsWith('_test.go'))) testCommand = 'go test ./...';
  if ([...fileSet].some(p => p.startsWith('test_') || p.endsWith('_test.py'))) testCommand = 'pytest';
  if ([...fileSet].some(p => p.endsWith('_test.rs'))) testCommand = 'cargo test';

  const ciNote = [...fileSet].some(p => p.startsWith('.github/workflows/'))
    ? 'GitHub Actions CI detected.'
    : 'No CI pipeline configuration found.';

  return {
    hasTests: testFiles.length > 0,
    testFiles,
    testCommand,
    ciConfig: [...fileSet].some(p => p.startsWith('.github/workflows/'))
      ? { platform: 'GitHub Actions', file: [...fileSet].find(p => p.startsWith('.github/workflows/')) }
      : null,
    ciNote,
  };
}

// Generate 5 Q&A pairs from what we actually found
function generateQA(meta, frameworks, tests, languages) {
  const fwNames = frameworks.map(f => f.name).join(', ') || 'no major frameworks detected';
  const langNames = languages.map(l => `${l.name} ${l.pct}%`).join(', ');
  return [
    {
      question: 'What tech stack does this repo use?',
      answer: `Languages: ${langNames}. Frameworks/tools detected: ${fwNames}. ${frameworks[0] ? frameworks[0].description : ''}`,
    },
    {
      question: 'How do I run the tests?',
      answer: tests.hasTests
        ? `Test files found: ${tests.testFiles.slice(0,3).join(', ')}. Run: \`${tests.testCommand}\`. ${tests.ciNote}`
        : `No test suite was detected in this repository. ${tests.ciNote}`,
    },
    {
      question: 'How do I install and run this project?',
      answer: frameworks.some(f => f.name === 'Django' || f.name === 'FastAPI' || f.name === 'Flask')
        ? 'Install Python dependencies: `pip install -r requirements.txt`. Then follow the framework\'s standard run command (e.g. `python manage.py runserver` for Django).'
        : frameworks.some(f => ['React','Next.js','Vue.js','Svelte','Express','Fastify'].includes(f.name))
          ? 'Install dependencies: `npm install`. Start the dev server: `npm run dev` or `npm start`.'
          : frameworks.some(f => f.name === 'Go modules')
            ? 'Build: `go build ./...`. Run: `go run .`.'
            : frameworks.some(f => f.name === 'Rust / Cargo')
              ? 'Build: `cargo build`. Run: `cargo run`.'
              : 'See the repository README for install and run instructions.',
    },
    {
      question: 'What CI/CD setup does this project use?',
      answer: tests.ciConfig
        ? `GitHub Actions CI is configured at ${tests.ciConfig.file}. ${tests.ciNote}`
        : `No CI/CD pipeline was found. ${tests.ciNote} Consider adding GitHub Actions or another CI provider.`,
    },
    {
      question: 'Are there any security concerns?',
      answer: (() => {
        const notes = frameworks.filter(f => f.securityNote).map(f => `${f.name}: ${f.securityNote}`);
        return notes.length > 0
          ? notes.join(' ')
          : 'No obvious dependency-level security concerns detected. Run `npm audit` or `pip-audit` for a full scan.';
      })(),
    },
  ];
}

// ---- Main handler ----------------------------------------------------------

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  let { repo } = req.body || {};
  if (!repo) { res.status(400).json({ error: 'Missing "repo" in request body (e.g. "owner/name").' }); return; }

  // Normalize: strip github.com prefix, leading slashes, trailing slashes
  repo = repo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/^\/|\/$/g, '').trim();
  const parts = repo.split('/');
  if (parts.length < 2) {
    res.status(400).json({ error: 'Repo must be in owner/name format (e.g. "facebook/react").' });
    return;
  }
  const [owner, name] = parts;

  try {
    // 1. Repo metadata
    const meta = await fetchRepoMeta(owner, name);
    const branch = meta.default_branch || 'main';

    // 2. Full file tree (one API call)
    const flatTree = await fetchTree(owner, name, branch);
    if (flatTree.length === 0) {
      res.status(422).json({ error: 'Repository appears to be empty.' });
      return;
    }

    const fileSet = new Set(flatTree.filter(i => i.type === 'blob').map(i => i.path));
    const fileTree = buildFileTree(flatTree);
    const languages = detectLanguages(flatTree);

    // 3. Fetch file contents in batches of 10 (avoids hammering GitHub with 40 parallel requests)
    const toFetch = pickPreviewFiles(flatTree);
    const contentEntries = [];
    for (let i = 0; i < toFetch.length; i += 10) {
      const batch = toFetch.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async path => [path, await fetchFileContent(owner, name, path)])
      );
      contentEntries.push(...results);
    }
    const fileContents = Object.fromEntries(contentEntries.filter(([, v]) => v !== null));

    // 4. Analysis
    const frameworks = detectFrameworks(fileSet, fileContents);
    const buildTools = detectBuildTools(fileSet, fileContents);
    const packageManifests = detectManifests(fileSet, fileContents);
    const tests = detectTests(fileSet);
    const commits = await fetchCommits(owner, name, branch);
    const qa = generateQA(meta, frameworks, tests, languages);

    // 5. Truncate file previews to first 60 lines each
    const trimmedContents = {};
    for (const [path, content] of Object.entries(fileContents)) {
      trimmedContents[path] = content.split('\n').slice(0, 60).join('\n');
    }

    const overallConf = frameworks.length > 0
      ? Math.round(frameworks.reduce((s, f) => s + f.confidence, 0) / frameworks.length)
      : 50;

    const result = {
      _generated_by: 'RepoReveal /api/analyze — live GitHub API analysis',
      _analysis_date: new Date().toISOString().slice(0, 10),

      repo: {
        name: meta.name,
        fullName: meta.full_name,
        description: meta.description || 'No description provided.',
        defaultBranch: branch,
        stars: meta.stargazers_count.toLocaleString(),
        forks: meta.forks_count.toLocaleString(),
        watchers: meta.watchers_count.toLocaleString(),
        readmeExcerpt: fileContents['README.md']
          ? fileContents['README.md'].split('\n').slice(0, 8).join('\n')
          : fileContents['readme.md']
            ? fileContents['readme.md'].split('\n').slice(0, 8).join('\n')
            : 'No README found.',
      },

      stats: {
        totalFiles: fileSet.size,
        totalLines: flatTree.filter(i => i.type === 'blob').reduce((s, i) => s + (i.size ? Math.ceil(i.size / 40) : 0), 0),
        techStackConfidence: overallConf,
        defaultBranch: branch,
      },

      languages,
      commits,
      fileTree,
      fileContents: trimmedContents,
      frameworks,
      buildTools,
      packageManifests,
      tests,
      qa,
    };

    res.status(200).json(result);

  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || String(err) });
  }
};
