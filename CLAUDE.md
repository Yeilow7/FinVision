# CLAUDE.md — FinVision

Working agreement for Claude Code on this repo. Read in full before non-trivial changes.

---

## Security (read first)

- **Alpha Vantage key `ALPHA_VANTAGE_KEY` is compromised.** A real key was previously committed in `backend/.env.example`. Treat as leaked until the user confirms rotation. Do not echo, log, or reference the key value anywhere in code, commits, comments, or chat output. Do not reintroduce it into `.env.example`.
- `backend/.env` is gitignored via the root `.gitignore` (`.env` pattern). Never commit `.env` files.
- `.env.example` ships placeholder values only. Real secrets must never land in it.
- Env vars actually read by the backend: `PORT`, `CORS_ORIGIN`, `ANTHROPIC_API_KEY`. Nothing else.

---

## Project

FinVision — Bloomberg-style financial terminal. Monorepo coordinated by `concurrently` at the repo root (no workspaces). Frontend on `5173`, backend on `3001`.

**Planned next (not landed):** Supabase auth + database. Two recent commits (`b896eff`, `b9afdd1`) carry the message but no code/deps shipped. If asked about auth, treat as upcoming, not present.

---

## Stack

**Frontend** (`frontend/`)
- React 18 + Vite 5 + TypeScript 5.5 strict (`noEmit`)
- Tailwind 3 with custom palette
- React Router v7, lazy-loaded routes
- Zustand (persisted via `localStorage`, key `finvision-store`)
- TradingView lightweight-charts, Recharts, d3, lucide-react
- PWA service worker registered in `main.tsx`
- `axios` is in deps but **unused** — code uses native `fetch`

**Backend** (`backend/`)
- Express 4, TypeScript ESM (`"type": "module"`, NodeNext)
- `tsx watch` for dev, `tsc` for build
- `@anthropic-ai/sdk`
- Yahoo Finance via direct `fetch` to public endpoints + an `execSync curl` crumb dance for the v7 endpoint
- `yahoo-finance2` is in deps but **unused** — see "Dependency cleanup"

---

## Layout

```
backend/src/index.ts          # all routes, helpers, cache (~991 lines, single file)
frontend/src/
  api/client.ts               # typed API surface (apiFetch<T>)
  pages/*.tsx                 # lazy-loaded route components
  components/*.tsx            # shared components (flat — no ui/ subfolder)
  hooks/{usePolling,useLocalStorage}.ts
  store/index.ts              # Zustand store
  types/index.ts              # central type definitions
  index.css                   # Tailwind + @layer components primitives
  lib/, contexts/             # empty — do not invent abstractions here
```

---

## Backend conventions

- Section banners: `// ─── Name ────────────────────────────────────────`
- Error pattern: `try/catch` → `res.status(500).json({ error: err.message })`
- 400 for client validation errors, 503 when an optional integration is unconfigured
- **All new routes must wrap their data layer in `cached(key, ttl, fn)`** with a justified TTL (existing examples: quote 10s, history 60s, news 120s, rich-quote 5min). State the TTL choice in the commit message.

### Backend extraction policy (verbatim)

The backend is one 991-line file. Don't refactor unprompted. When editing it:

- You **may** extract a route group (e.g., all `/api/portfolio/*` → `backend/src/routes/portfolio.ts`) **if** the extraction is mechanical and low-risk.
- You **must not** extract more than what's directly related to the change you're making.
- Shared utilities (`cached`, the crumb logic, middleware, the symbol-alias map) stay in `index.ts`. Don't touch them unless explicitly asked.
- If extraction would require touching more than ~50 lines beyond the original change, **stop and ask first**.
- Always run the verification loop after any extraction.

### Special cases — do not copy

- The Yahoo crumb-cookie dance uses `execSync` with `curl` (`backend/src/index.ts:84-146`). This is a quarantined workaround, not a pattern. **No new `execSync` anywhere.** Use `fetch` or a proper library.

---

## Frontend conventions

### Data fetching (standard for new API calls)

1. Add a typed method to `frontend/src/api/client.ts` (uses native `fetch` via `apiFetch<T>`).
2. Consume in components with:
   - `useEffect` for one-shot loads
   - `usePolling(fn, intervalMs, enabled?)` from `frontend/src/hooks/usePolling.ts` for periodic refresh
   - `api.subscribeStream(symbols, onData)` for SSE (returns a cleanup fn)
3. Hold results in local `useState`; pair with `loading` and `error` siblings as needed.
4. Standard polling cadence: **30s** for tables/lists, **15s** for the focused chart/quote.

Do **not** introduce React Query, SWR, or axios. Don't bring in a new HTTP client.

### Error handling (frontend)

No toast library, no error boundary — by design. Inline error UI is the standard:

```ts
const [error, setError] = useState<string | null>(null);
// in catch: setError(e.message)
// render: {error && <div className="text-accent-red text-xs">{error}</div>}
```

Silent swallows (`.catch(() => {})`) exist in the codebase but are a smell. New code should either set an error state or leave a one-line comment justifying the swallow (e.g., "best-effort prefetch — UI tolerates missing data"). Do **not** introduce `react-hot-toast`, `sonner`, or `react-toastify` without asking.

### UI primitives

There is **no `components/ui/` folder.** Reusable primitives live as `@layer components` classes in `frontend/src/index.css`:

- `.card`
- `.btn-primary`, `.btn-ghost`
- `.input-field`
- `.badge-up`, `.badge-down`
- `.timeframe-btn`, `.timeframe-btn-active`, `.timeframe-btn-inactive`
- `.indicator-btn`, `.indicator-btn-active`, `.indicator-btn-inactive`

Reuse these before writing fresh Tailwind soup. If a pattern repeats 3+ times, propose adding it to `@layer components` in `index.css` rather than inventing a primitives folder.

### Tailwind palette (guardrail)

Only use the existing tokens. No new hex values without asking.

- Background: `navy-950, navy-900, navy-800, navy-700, navy-600, navy-500`
- Accent: `accent-green, accent-cyan, accent-red, accent-yellow`
- Text: `slate-200/300/400/500/600` (Tailwind defaults) and `white`
- Fonts: `font-sans` (Inter) and `font-mono` (JetBrains Mono)

### State

Zustand store at `frontend/src/store/index.ts`, persisted under `finvision-store`. Watchlist, positions, selected ticker, recent searches, theme, alerts all live there. Add new fields here rather than spinning up new contexts.

---

## Verification loop (run before claiming a task done)

1. `cd backend && npx tsc --noEmit`
2. `cd frontend && npx tsc --noEmit`
3. If backend routes were touched: hit the affected endpoint with `curl` against `http://localhost:3001`. Examples:
   - `curl -s http://localhost:3001/api/quote/AAPL`
   - `curl -s "http://localhost:3001/api/history/AAPL?timeframe=1M"`
4. If a change is UI-only and can't be verified beyond type-checking, **say so explicitly** — don't claim functional success.

Note: `vite build` skips `tsc` (commit `6a673f5` unblocked Vercel deploys). The frontend type-check is therefore a manual step Claude must run.

### Hooks and their limits

- `.claude/hooks/block-secrets.sh` (PreToolUse) — **assistant-visible.** Blocks Edit/Write/MultiEdit on `.env` files. PreToolUse exit-2 + stderr reliably surfaces to the assistant as a tool-error block. Verified working.
- `.claude/hooks/verify-on-src-edit.sh` (PostToolUse) — **user-terminal-only, NOT assistant-visible** in CLI v2.1.141. Runs `tsc --noEmit` after substantive edits in `backend/src` or `frontend/src` and emits both an stderr summary and a JSON-to-stdout block (`decision: "block"` + `reason` + `hookSpecificOutput.additionalContext`). The hook is correct per docs, but neither channel surfaces to the assistant — only the user sees the output in their terminal.
- **Implication for Claude:** do not treat the absence of a PostToolUse error block as proof that tsc passed. Run the verification loop explicitly (`npx tsc --noEmit` in the affected package) before claiming any change under `backend/src` or `frontend/src` done. The `verify-loop` subagent is the primary guardrail; the PostToolUse hook is a secondary user-side signal only.
- **Discrepancy note for future re-check.** Docs at `https://code.claude.com/docs/en/hooks.md` describe PostToolUse exit-2 stderr forwarding and structured `decision: "block"` JSON output as assistant-visible. Empirical test on **2026-05-14** with **Claude Code CLI v2.1.141** confirmed neither works for PostToolUse on Edit. Re-test on future CLI upgrades; if the channel starts working, this section can be revised.

---

## Anthropic SDK usage (backend)

Single call site: `POST /api/ai/analyze` at `backend/src/index.ts:575-602`.

- Client: `new Anthropic()` reads `ANTHROPIC_API_KEY` from env, null-guarded → returns 503 if unset.
- Non-streaming `messages.create`, `max_tokens: 1024`.
- **Model currently pinned to `claude-sonnet-4-20250514` — outdated.** Current default should be `claude-sonnet-4-6`. Flag this when working in that file; do **not** silently bump without asking.
- **No `system:` parameter** — the instruction is inlined as the user-role message. For new Claude calls, prefer `system:` for instructions and `messages` for data.
- Output is freeform text coerced to JSON via `text.match(/\{[\s\S]*\}/)`. Brittle but accepted for this one endpoint. For any new Claude calls that need structured output, use tool use, not regex.
- Error pattern: project default — `try/catch` → `res.status(500).json({ error: err.message })`.

---

## Commands

From the repo root:

```bash
npm run dev                 # boots backend + frontend via concurrently
npm run install:all         # install root + backend + frontend deps
```

Per package:

```bash
cd backend  && npx tsc --noEmit   # type-check
cd backend  && npm run dev        # tsx watch
cd frontend && npx tsc --noEmit   # type-check
cd frontend && npm run dev        # vite dev server
```

Smoke endpoints (assumes backend running on 3001):

```bash
curl -s http://localhost:3001/api/quote/AAPL
curl -s http://localhost:3001/api/market-overview
curl -s "http://localhost:3001/api/history/AAPL?timeframe=1M"
curl -s http://localhost:3001/api/news/AAPL
```

---

## Commits

Conventional Commits in spirit. Only `feat:` and `fix:` have been used so far in history. Match that. Use other prefixes (`chore:`, `refactor:`, `docs:`) only when clearly applicable — don't sprinkle them. Keep subjects short; use the body for the "why".

---

## Testing

No test suite currently. **Do not generate tests unless explicitly requested.** When requested, use **Vitest** for both packages (matches Vite + ESM). Don't add Jest.

---

## Dependency cleanup (one-shot, when next touching deps)

Both can be removed without code changes:

- `backend`: `npm uninstall yahoo-finance2 --prefix backend` — installed but never imported (`backend/src/index.ts:5` documents the decision to use direct `fetch` instead). **Do not reintroduce.**
- `frontend`: `npm uninstall axios --prefix frontend` — installed but unused; the app uses native `fetch`. **Do not reintroduce** without asking.

Not blocking. Tackle as a `chore:` commit when you're already in the dependency neighborhood.

---

## Follow-ups (tracked, do not act on without explicit request)

1. **Alpha Vantage key rotation** — user will rotate the previously-leaked `ALPHA_VANTAGE_KEY` themselves immediately after the session that introduced this file. Until that's confirmed, treat the key as compromised (see "Security"). After rotation is confirmed by the user, this note can be removed.
2. **Anthropic model bump** — the AI route still points at `claude-sonnet-4-20250514`. Do **not** silently update. When the user is ready, propose a bump as a separate task with trade-offs (e.g., `claude-sonnet-4-5` vs `claude-sonnet-4-6` vs `claude-opus-4-7`: latency, cost, quality, JSON-mode reliability) and let the user pick.

---

## Things that surprise readers

- `concurrently` lives at the repo root, but there are no npm workspaces — each package installs independently.
- `yahoo-finance2` and `axios` are deps but unused; the chosen pattern is native `fetch`.
- `vite build` skips `tsc`. Type errors only surface from explicit `npx tsc --noEmit` runs.
- The Yahoo v7 endpoint uses a cookie+crumb handshake via `execSync curl` because Node `fetch` cookie handling was inadequate. Quarantined — see "Special cases".
- The AI route pins a model ID that is now outdated (`claude-sonnet-4-20250514`).
