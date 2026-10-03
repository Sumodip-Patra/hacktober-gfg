# GitHub Contribution Tracker: Backend Design

Date: 2026-10-02
Status: Draft for review

## 1. Purpose and constraints

A hackathon entry that lets a user sign in with GitHub and see their open source contributions: the repos they have contributed PRs to, the status of each PR, and streak and stats.

- Team: solo backend developer. A separate person builds the frontend.
- Time budget: about 8 hours.
- Stack: Next.js (Route Handlers) with plain JavaScript, backend only.
- Extra feature: streak and stats only.

### Non-goals

- Database, webhooks, background worker, Redis, notifications, PR event timeline.
- Private repository data.
- GitLab merge requests (GitHub only).
- Manual cache refresh, multi-user admin features.

## 2. Architecture

Next.js Route Handlers only. No separate server.

```
app/api/auth/[...nextauth]/route.js   GitHub OAuth (Auth.js)
app/api/me/route.js
app/api/repos/route.js
app/api/pulls/route.js
app/api/stats/route.js
lib/auth.js      get session and GitHub token, or throw UNAUTHENTICATED
lib/github.js    only file that talks to GitHub (GraphQL)
lib/stats.js     pure functions: streak, totals, per-repo, activity by day
lib/cache.js     in-memory Map with TTL
lib/errors.js    unified error shape and helpers
lib/cors.js      CORS headers for the configured frontend origin
lib/mock.js      fixture data for MOCK mode
```

### Request flow

1. Validate the session and obtain the user's GitHub token (or return 401).
2. Look up `${githubId}:prs` in the cache (TTL 5 minutes). Return on hit.
3. On miss, run one paged GraphQL search: `author:USERNAME type:pr is:public sort:created-desc`, 100 per page, at most 3 pages (300 PRs).
4. Normalize PRs, store in the cache, then derive the endpoint response from them.

All four data endpoints read from the same cached PR list, so there is about one GitHub call per user per 5 minutes. In serverless hosting the cache is per instance and may reset, which is acceptable for a demo.

## 3. Authentication

- Auth.js (NextAuth) GitHub provider, JWT session stored in a cookie.
- OAuth scope: `read:user` only (public data).
- The GitHub access token stays server-side inside the encrypted session. It is never returned in any response.
- Login: frontend links to `/api/auth/signin/github` with the frontend URL as the post-login redirect. Afterwards the frontend calls the API with `fetch(url, { credentials: 'include' })`.
- CORS: allow exactly one origin, taken from `FRONTEND_URL`, with credentials enabled.
- Deployment note: if frontend and backend are on different domains in production, the session cookie must use `SameSite=None; Secure`.

Environment variables: `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `FRONTEND_URL`, `MOCK`.

## 4. API contract

All responses are JSON. All endpoints require a session, except in MOCK mode.

### GET /api/me

```json
{ "username": "octocat", "avatarUrl": "https://...", "profileUrl": "https://github.com/octocat" }
```

### GET /api/repos

Repos where the user has authored PRs, grouped from the PR list.

Query: `scope=external` (default) or `scope=all`.
External means the repo owner's login differs from the user's login (organization repos count as external).

```json
[{ "fullName": "owner/name", "url": "https://...", "prCount": 4, "mergedCount": 2, "lastActivityAt": "2026-09-30T10:00:00Z" }]
```

`lastActivityAt` is the latest of `createdAt`, `mergedAt` and `closedAt` across the repo's PRs.

### GET /api/pulls

Query: `state=open|merged|closed|all` (default `all`), `repo=owner/name` (optional), `scope` as above.

```json
[{ "number": 12, "title": "Fix typo", "url": "https://...", "repo": "owner/name", "state": "merged",
   "createdAt": "...", "mergedAt": "...", "closedAt": "..." }]
```

State mapping: GitHub `OPEN` becomes `open`. GitHub `CLOSED` with merged flag becomes `merged`. GitHub `CLOSED` without merged flag becomes `closed`. Timestamps not applicable are `null`.

### GET /api/stats

Query: `scope` as above.

```json
{
  "totals": { "totalPrs": 20, "open": 3, "merged": 12, "closedUnmerged": 5, "repos": 7 },
  "streak": { "current": 4, "longest": 9 },
  "perRepo": [{ "repo": "owner/name", "merged": 3, "open": 1 }],
  "activityByDay": [{ "date": "2026-09-30", "count": 2 }]
}
```

### Streak definition

- A day counts if the user opened or merged at least one PR (in scope) that day, using UTC dates.
- `activityByDay.count` is the number of PRs opened that day plus the number merged that day.
- `current` is the run of consecutive counted days ending today or yesterday (0 if the latest counted day is older).
- `longest` is the longest run of consecutive counted days in the fetched data.
- Totals and streaks are computed from the fetched PRs (up to 300), so very heavy contributors may see partial history.

## 5. Errors

One shape for every error:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Please sign in." } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid query parameter value |
| 401 | `UNAUTHENTICATED` | No valid session |
| 429 | `RATE_LIMITED` | GitHub rate limit reached |
| 502 | `UPSTREAM_ERROR` | GitHub unavailable or returned an unexpected error |

## 6. Mock mode

When `MOCK=true`, all endpoints skip authentication and GitHub and return a realistic fixture from `lib/mock.js`, so the frontend developer can build against the contract from the first hour.

## 7. Testing

- Unit tests for `lib/stats.js` only: empty history, activity today versus only yesterday, a gap in the middle, UTC day boundary, and the longest-versus-current distinction.
- Every other piece is verified by calling the endpoint once for real.

## 8. Build order (about 8 hours)

1. Hour 0: share this contract with the frontend developer and enable mock mode.
2. About 1 hour: project setup, GitHub OAuth app, login working, `/api/me`.
3. About 1.5 hours: `lib/github.js`, cache, `/api/pulls`.
4. About 1 hour: `/api/repos`.
5. About 1.5 hours: `lib/stats.js` with tests, `/api/stats`.
6. About 1 hour: CORS, unified errors, rate-limit handling.
7. Remaining time: deploy by the midpoint, end-to-end test with the frontend developer, buffer.

## 9. Risks

- OAuth callback or redirect URL misconfigured. Mitigation: set it up first and test early.
- Cookies failing across domains after deployment. Mitigation: deploy by the midpoint.
- GitHub rate limits. Mitigation: shared cached fetch, 300-PR cap.
