# GitHub Contribution Tracker Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js (JavaScript) backend with four endpoints (`/api/me`, `/api/repos`, `/api/pulls`, `/api/stats`) that shows a user's open source PRs, streaks and stats from GitHub.

**Architecture:** Route Handlers only. One cached GitHub GraphQL fetch per user feeds all endpoints; pure functions in `lib/stats.js` derive every response. Auth.js cookie session holds the GitHub token server-side.

**Tech Stack:** Next.js App Router, `next-auth@4`, Node built-in test runner (`node --test`), plain JavaScript (ES modules).

**Spec:** `docs/superpowers/specs/2026-10-02-github-contribution-tracker-design.md` (executors read both; the spec wins on any conflict).

## Global Constraints

- JavaScript only, no TypeScript. No database, Redis, worker, webhooks, or extra files beyond the spec's file list.
- OAuth scope `read:user` only. The GitHub token is never returned in any response.
- GitHub search: `author:USERNAME type:pr is:public sort:created-desc`, 100 per page, at most 3 pages (300 PRs).
- Cache: in-memory Map, TTL 5 minutes, key `${githubId}:prs`, shared by all endpoints.
- Error shape `{ "error": { "code", "message" } }`: 400 `BAD_REQUEST`, 401 `UNAUTHENTICATED`, 429 `RATE_LIMITED`, 502 `UPSTREAM_ERROR`.
- CORS: exactly one origin from `FRONTEND_URL`, credentials enabled.
- All dates are UTC. Tests exist for `lib/stats.js` only.
- Env vars: `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `FRONTEND_URL`, `MOCK`.

## Review Focus

1. User with zero PRs: every endpoint returns empty lists and zeros, not an error (test in Task 3, curl in Task 4).
2. A PR opened and merged on the same UTC day counts twice for that day, per the spec formula (test in Task 3).
3. `repo=Owner/Name` filter matches regardless of letter case (test in Task 3).
4. Unknown `state` or `scope` value returns 400 `BAD_REQUEST`, never silently ignored (curl in Task 4).
5. GitHub answering 401 (revoked token) returns 401 `UNAUTHENTICATED`, not 502 (implemented in Task 4, no test per spec).

## File Structure

```
app/api/auth/[...nextauth]/route.js   OAuth handler (re-exports NextAuth(authOptions))
app/api/me|repos|pulls|stats/route.js thin endpoints
lib/auth.js      authOptions + getUser(request)
lib/github.js    GraphQL fetch + getPullRequests(user)
lib/stats.js     pure derivations from the PR list
lib/cache.js     cached(key, load, ttlMs)
lib/errors.js    ApiError, respond, oneOf
lib/cors.js      corsHeaders, preflight
lib/mock.js      mockUser, mockPrs
```

Shared types (JSDoc only): `User = { githubId, username, avatarUrl, accessToken }`; `Pr = { number, title, url, repo, owner, state: 'open'|'merged'|'closed', createdAt, mergedAt, closedAt }` (timestamps are ISO strings or `null`; `repo` is `owner/name`).

---

### Task 1: Scaffold, shared helpers, `/api/me` in mock mode

**Files:**
- Create: `package.json` (via create-next-app), `next.config.mjs`, `.env.example`, `lib/errors.js`, `lib/cors.js`, `lib/mock.js`, `lib/auth.js`, `app/api/me/route.js`

**Interfaces:**
- Produces:
  - `class ApiError extends Error` with `constructor(status: number, code: string, message: string)`
  - `respond(handler: (request: Request) => Promise<object>): (request: Request) => Promise<Response>`: success is `Response.json(data, { headers: corsHeaders() })`; an `ApiError` becomes the error shape with its status; any other error becomes 500 `INTERNAL_ERROR` in the same shape; CORS headers on every response.
  - `oneOf(value: string | null, allowed: string[], fallback: string, name: string): string`: returns `fallback` when `value` is null, throws `ApiError(400, 'BAD_REQUEST', 'Invalid ' + name)` when not allowed.
  - `corsHeaders(): Record<string,string>` (origin `FRONTEND_URL`, credentials `true`, methods `GET,OPTIONS`, `Vary: Origin`); `preflight(): Response` (204 with those headers).
  - `getUser(request: Request): Promise<User>`: returns `mockUser` when `MOCK === 'true'`; otherwise reads the Auth.js JWT with `getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })`, throws `ApiError(401, 'UNAUTHENTICATED', 'Please sign in.')` if absent.
  - `mockUser: User`; `mockPrs(now = new Date()): Pr[]`: 8 or more PRs with dates relative to `now` (today, yesterday, 2 and 3 days ago, plus older), mixed states, at least 3 repos, one owned by `mockUser.username`.

- [ ] **Step 1: Scaffold.** Run `npx create-next-app@latest contribution-tracker-api` (JavaScript, App Router, no Tailwind, no ESLint, no `src/`). Delete generated page, CSS and favicon, keeping the minimal `app/layout.js` so the dev server starts. Install `next-auth@4`. In `package.json` add `"type": "module"` and `"test": "node --test"`; rename `next.config.js` to `next.config.mjs` if generated as CommonJS. Create `.env.example` listing the six env vars; ensure `.env.local` is git-ignored.
- [ ] **Step 2: Implement** `lib/errors.js`, `lib/cors.js`, `lib/mock.js`, `lib/auth.js` (`getUser` only for now) per the Interfaces block.
- [ ] **Step 3: Implement** `app/api/me/route.js`: `GET = respond(...)` returning `{ username, avatarUrl, profileUrl }` with `profileUrl = https://github.com/{username}`, and `export const OPTIONS = preflight`.
- [ ] **Step 4: Verify.** Run `MOCK=true FRONTEND_URL=http://localhost:5173 npm run dev`. `curl -i localhost:3000/api/me` shows 200, the mock user JSON, and `access-control-allow-origin: http://localhost:5173`. `curl -i -X OPTIONS localhost:3000/api/me` shows 204.
- [ ] **Step 5: Hand the contract over.** Send spec section 4 to the frontend developer and tell them to run against `MOCK=true`.
- [ ] **Step 6: Commit** `feat: scaffold, error and cors helpers, mock /api/me`

---

### Task 2: GitHub OAuth login

**Files:**
- Modify: `lib/auth.js`
- Create: `app/api/auth/[...nextauth]/route.js`

**Interfaces:**
- Produces: `authOptions` exported from `lib/auth.js` (route files may not export it, so it lives here).

- [ ] **Step 1: Create a GitHub OAuth App** with callback URL `http://localhost:3000/api/auth/callback/github`; put `GITHUB_ID`, `GITHUB_SECRET`, a random `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3000` and `FRONTEND_URL` in `.env.local`.
- [ ] **Step 2: Implement `authOptions`** in `lib/auth.js`: `GitHubProvider` with `authorization: { params: { scope: 'read:user' } }`; `session: { strategy: 'jwt' }`; `callbacks.jwt` copies on sign-in `account.access_token` to `token.accessToken`, `String(profile.id)` to `token.githubId`, `profile.login` to `token.username`, `profile.avatar_url` to `token.avatarUrl`; `callbacks.redirect({ url, baseUrl })` returns `url` when it starts with `FRONTEND_URL` or `baseUrl`, else `baseUrl` (default Auth.js blocks the frontend origin). Make `getUser` map those token fields to a `User`.
- [ ] **Step 3: Implement the route:** `const handler = NextAuth(authOptions); export { handler as GET, handler as POST };`
- [ ] **Step 4: Verify** with `MOCK` unset. `curl -i localhost:3000/api/me` returns 401 with the error shape. In a browser, open `localhost:3000/api/auth/signin/github`, log in, then open `/api/me`: it shows your username. Open `/api/auth/session`: the response must not contain the access token (no string starting `gho_`).
- [ ] **Step 5: Commit** `feat: github oauth login`

---

### Task 3: Stats functions (TDD)

**Files:**
- Create: `lib/stats.js`, `lib/stats.test.js`

**Interfaces:**
- Produces:
  - `filterScope(prs: Pr[], scope: 'external'|'all', username: string): Pr[]`: `external` drops PRs whose `owner` equals `username` (case-insensitive).
  - `filterPulls(prs: Pr[], opts: { state: 'open'|'merged'|'closed'|'all', repo?: string }): Pr[]`: repo compared case-insensitively.
  - `groupRepos(prs: Pr[]): { fullName, url, prCount, mergedCount, lastActivityAt }[]`: `url = https://github.com/{fullName}`; `lastActivityAt` is the latest of `createdAt`, `mergedAt`, `closedAt`; sorted by `lastActivityAt` descending.
  - `computeStats(prs: Pr[], today: string): { totals, streak, perRepo, activityByDay }` with `today` as `YYYY-MM-DD` (UTC) and shapes exactly as spec section 4; `perRepo` sorted by `merged` desc, then `open` desc, then `repo` asc; `activityByDay` ascending by date, null timestamps ignored.

- [ ] **Step 1: Write the failing tests** in `lib/stats.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterScope, filterPulls, groupRepos, computeStats } from './stats.js';

const pr = (o) => ({ number: 1, title: 't', url: 'u', repo: 'a/b', owner: 'a', state: 'open',
  createdAt: null, mergedAt: null, closedAt: null, ...o });
const days = (...ds) => ds.map((d) => pr({ createdAt: `${d}T10:00:00Z` }));

test('empty history gives zeros and empty lists', () => {
  assert.deepEqual(computeStats([], '2026-10-02'), {
    totals: { totalPrs: 0, open: 0, merged: 0, closedUnmerged: 0, repos: 0 },
    streak: { current: 0, longest: 0 }, perRepo: [], activityByDay: [] });
});
test('streak ending today', () => {
  assert.deepEqual(computeStats(days('2026-09-30', '2026-10-01', '2026-10-02'), '2026-10-02').streak, { current: 3, longest: 3 });
});
test('streak ending yesterday is still current', () => {
  assert.equal(computeStats(days('2026-09-30', '2026-10-01'), '2026-10-02').streak.current, 2);
});
test('activity older than yesterday resets current only', () => {
  assert.deepEqual(computeStats(days('2026-09-28', '2026-09-29'), '2026-10-02').streak, { current: 0, longest: 2 });
});
test('a gap splits runs', () => {
  const ds = days('2026-09-26', '2026-09-27', '2026-09-28', '2026-10-01', '2026-10-02');
  assert.deepEqual(computeStats(ds, '2026-10-02').streak, { current: 2, longest: 3 });
});
test('PR opened and merged the same day counts twice', () => {
  const p = pr({ state: 'merged', createdAt: '2026-10-01T01:00:00Z', mergedAt: '2026-10-01T09:00:00Z' });
  assert.deepEqual(computeStats([p], '2026-10-02').activityByDay, [{ date: '2026-10-01', count: 2 }]);
});
test('PR merged on a later day counts on both days', () => {
  const p = pr({ state: 'merged', createdAt: '2026-09-30T10:00:00Z', mergedAt: '2026-10-01T10:00:00Z' });
  const s = computeStats([p], '2026-10-02');
  assert.deepEqual(s.activityByDay, [{ date: '2026-09-30', count: 1 }, { date: '2026-10-01', count: 1 }]);
  assert.equal(s.streak.current, 2);
});
test('dates use UTC', () => {
  const ps = [pr({ createdAt: '2026-10-01T23:59:59Z' }), pr({ createdAt: '2026-10-02T00:00:00Z' })];
  assert.deepEqual(computeStats(ps, '2026-10-02').activityByDay.map((d) => d.date), ['2026-10-01', '2026-10-02']);
});
test('totals and perRepo', () => {
  const ps = [pr({ state: 'open' }), pr({ state: 'merged', mergedAt: '2026-10-01T00:00:00Z' }), pr({ state: 'closed', repo: 'c/d' })];
  const s = computeStats(ps, '2026-10-02');
  assert.deepEqual(s.totals, { totalPrs: 3, open: 1, merged: 1, closedUnmerged: 1, repos: 2 });
  assert.deepEqual(s.perRepo, [{ repo: 'a/b', merged: 1, open: 1 }, { repo: 'c/d', merged: 0, open: 0 }]);
});
test('external scope drops own repos, case-insensitively', () => {
  const ps = [pr({ owner: 'Sumo' }), pr({ owner: 'other' })];
  assert.deepEqual(filterScope(ps, 'external', 'sumo').map((p) => p.owner), ['other']);
  assert.equal(filterScope(ps, 'all', 'sumo').length, 2);
});
test('filterPulls by state and repo, repo case-insensitive', () => {
  const ps = [pr({ repo: 'Foo/Bar' }), pr({ state: 'merged', repo: 'foo/bar' }), pr({ repo: 'x/y' })];
  assert.equal(filterPulls(ps, { state: 'open', repo: 'foo/BAR' }).length, 1);
  assert.equal(filterPulls(ps, { state: 'all' }).length, 3);
});
test('groupRepos counts and latest activity', () => {
  const ps = [pr({ state: 'merged', createdAt: '2026-09-01T00:00:00Z', mergedAt: '2026-09-05T00:00:00Z' }), pr({ createdAt: '2026-09-03T00:00:00Z' })];
  assert.deepEqual(groupRepos(ps), [{ fullName: 'a/b', url: 'https://github.com/a/b', prCount: 2, mergedCount: 1, lastActivityAt: '2026-09-05T00:00:00Z' }]);
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (module exports missing).
- [ ] **Step 3: Implement** the four functions in `lib/stats.js`. Streak algorithm: collect unique UTC dates (`slice(0, 10)`) from every `createdAt` and `mergedAt`, sort ascending, split into runs of consecutive days; `longest` is the longest run; `current` is the length of the run whose last date is `today` or the day before, else 0.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: stats derivations with tests`

---

### Task 4: GitHub fetch, cache, `/api/pulls`, `/api/repos`

**Files:**
- Create: `lib/cache.js`, `lib/github.js`, `app/api/pulls/route.js`, `app/api/repos/route.js`

**Interfaces:**
- Consumes: `getUser`, `respond`, `oneOf`, `preflight`, `mockPrs`, `filterScope`, `filterPulls`, `groupRepos` (Tasks 1 to 3).
- Produces:
  - `cached(key: string, load: () => Promise<T>, ttlMs = 300000): Promise<T>`
  - `getPullRequests(user: User): Promise<Pr[]>`: returns `mockPrs()` when `MOCK === 'true'`; otherwise `cached(`${user.githubId}:prs`, ...)` around the GitHub fetch.

- [ ] **Step 1: Implement `lib/cache.js`** (Map of `{ value, expires }`).
- [ ] **Step 2: Implement `getPullRequests`** in `lib/github.js`. POST to `https://api.github.com/graphql` with `Authorization: Bearer <accessToken>`. Query is a `search(query:$q, type:ISSUE, first:100, after:$cursor)` selecting `pageInfo { hasNextPage endCursor }` and, on `PullRequest`, `number title url state merged createdAt mergedAt closedAt repository { nameWithOwner owner { login } }`; follow `endCursor` for at most 3 pages. Normalize to `Pr`: `state = merged ? 'merged' : state === 'OPEN' ? 'open' : 'closed'`, `repo = nameWithOwner`, `owner = owner.login`. Error mapping: HTTP 401 becomes `ApiError(401,'UNAUTHENTICATED')`; HTTP 403/429 or a GraphQL error of type `RATE_LIMITED` becomes `ApiError(429,'RATE_LIMITED')`; any other failure (network, non-OK, GraphQL errors) becomes `ApiError(502,'UPSTREAM_ERROR')`.
- [ ] **Step 3: Implement `/api/pulls`.** Read `scope = oneOf(..., ['external','all'], 'external', 'scope')`, `state = oneOf(..., ['open','merged','closed','all'], 'all', 'state')`, optional `repo`; return `filterPulls(filterScope(prs, scope, user.username), { state, repo })` with each item reduced to the spec fields (drop `owner`). Add `OPTIONS = preflight`.
- [ ] **Step 4: Implement `/api/repos`** the same way using `scope` and `groupRepos`.
- [ ] **Step 5: Verify with mock.** `MOCK=true`: `curl 'localhost:3000/api/pulls?state=merged'` returns only merged PRs; `curl 'localhost:3000/api/pulls?state=bogus'` returns 400 with the error shape; `curl localhost:3000/api/repos` returns grouped repos and excludes the user's own repo; `curl 'localhost:3000/api/repos?scope=all'` includes it.
- [ ] **Step 6: Verify for real** (`MOCK` unset, logged in via browser): `/api/pulls` shows your real PRs. Add a temporary `console.log` inside the `load` function; two requests within 5 minutes print it once; remove the log. Confirm an account with no PRs returns `[]`.
- [ ] **Step 7: Commit** `feat: github fetch with cache, pulls and repos endpoints`

---

### Task 5: `/api/stats` and deployment

**Files:**
- Create: `app/api/stats/route.js`

**Interfaces:**
- Consumes: `getPullRequests`, `filterScope`, `computeStats`, `oneOf`, `respond`, `preflight`.

- [ ] **Step 1: Implement `/api/stats`:** `scope` via `oneOf`; return `computeStats(filterScope(prs, scope, user.username), new Date().toISOString().slice(0, 10))`; add `OPTIONS = preflight`.
- [ ] **Step 2: Verify.** `MOCK=true curl localhost:3000/api/stats` shows a non-zero current streak. With a real login, `/api/stats` matches the PRs shown by `/api/pulls`.
- [ ] **Step 3: Deploy by the midpoint** (for example Vercel) with all six env vars set (`MOCK` unset). Update the GitHub OAuth App callback to `https://<host>/api/auth/callback/github` and set `NEXTAUTH_URL` to the deployed origin. If the frontend is on a different domain, set `cookies.sessionToken.options` to `{ sameSite: 'none', secure: true }` in `authOptions` (spec section 3).
- [ ] **Step 4: End-to-end test with the frontend developer** against the deployed URL: login, then all four endpoints from their app with `credentials: 'include'`.
- [ ] **Step 5: Commit** `feat: stats endpoint`
