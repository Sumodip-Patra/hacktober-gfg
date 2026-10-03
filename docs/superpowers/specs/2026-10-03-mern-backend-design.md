# GitHub Contribution Tracker: MERN Backend Design

Date: 2026-10-03
Status: Draft for review
Builds on: `2026-10-02-github-contribution-tracker-design.md`. This document replaces its stack-specific parts (section 2 architecture, section 3 auth, environment variables). Its purpose, API contract (section 4, including the streak definition), error shapes (section 5) and testing rule (section 7) stay unchanged.

## 1. Why and constraints

- The hackathon requires the MERN stack, so MongoDB and Express must be genuinely used.
- Under 3 hours left, solo backend developer, a teammate builds the React frontend.
- Minimal code: nothing beyond what this spec lists.

## 2. Architecture

Express (ES modules, plain JavaScript) with Mongoose.

```
server.js          Express app: cors, session, passport, routes, error handler, listen
routes/api.js      GET /api/me, /api/repos, /api/pulls, /api/stats
routes/auth.js     login, callback, logout
lib/auth.js        Passport GitHub strategy; getUser(req)
lib/db.js          Mongoose connection and the PrSnapshot model
lib/github.js      GraphQL fetch (unchanged logic) + getPullRequests(user)
lib/stats.js       unchanged, with its 12 tests
lib/mock.js        unchanged
lib/errors.js      ApiError + Express error middleware (same error shape)
```

### Request flow

1. `getUser(req)` reads the session user, or throws 401 `UNAUTHENTICATED`.
2. `getPullRequests(user)` looks up the user's snapshot in MongoDB. If `fetchedAt` is under 5 minutes old, it is returned.
3. Otherwise one paged GitHub GraphQL fetch runs (same query and 3 x 100 page cap as before), the snapshot is upserted with a new `fetchedAt`, and the PRs are returned.
4. Concurrent requests for the same user share one in-flight fetch (a Map of pending promises keyed by `githubId`).

Mock mode (`MOCK=true`) skips MongoDB entirely and returns `mockUser` and `mockPrs()`, so the server runs without a database.

## 3. Authentication

- `passport-github2`, scope `read:user` only.
- `express-session` with `connect-mongo` as the store, encrypted with `SESSION_SECRET`. Cookie name is the default `connect.sid`, `httpOnly`.
- The session holds `{ githubId, username, avatarUrl, accessToken }`. The access token is never returned in any response.
- Routes:
  - `GET /api/auth/github?redirect=<url>`: the redirect is kept in the session only if its origin equals the `FRONTEND_URL` origin, otherwise `FRONTEND_URL` is used; then Passport sends the user to GitHub.
  - `GET /api/auth/github/callback`: on success redirect to the stored URL; on failure redirect to `FRONTEND_URL`.
  - `POST /api/auth/logout`: ends the session, responds 204.
- CORS: the `cors` package with `origin: FRONTEND_URL` and `credentials: true`.
- Cross-domain deployment: set the session cookie to `sameSite: 'none'`, `secure: true` and `app.set('trust proxy', 1)` when the frontend and backend are on different domains.

Environment variables: `MONGODB_URI`, `SESSION_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `FRONTEND_URL`, `BACKEND_URL` (used to build the GitHub callback URL), `PORT` (default 3000), `MOCK`.

## 4. Data model

- `prsnapshots`: `githubId` (string, unique), `prs` (array of the PR shape), `fetchedAt` (date).
- `sessions`: managed by `connect-mongo`.

## 5. API and errors

Unchanged from the earlier spec: the four endpoints, their JSON, `scope`, `state` and `repo` parameters, the streak definition, and the error table. One addition already in use: unexpected errors return 500 `INTERNAL_ERROR` in the same error shape.

## 6. Testing

Unchanged: unit tests for `lib/stats.js` only (12 existing tests). Everything else is verified by calling it once for real.

## 7. Removed

Next.js (`app/`, `next.config.mjs`), `next-auth`, `lib/cache.js` (replaced by the MongoDB snapshot), `lib/cors.js` (replaced by the `cors` package).

## 8. Changes for other people

- Frontend: the login link becomes `<API>/api/auth/github?redirect=<frontend URL>`. Requests still use `credentials: 'include'`.
- GitHub OAuth App callback URL: `http://localhost:3000/api/auth/github/callback`.
- Postman: set the `cookieName` variable to `connect.sid`.
- `.env`: `MONGODB_URI` and `BACKEND_URL` are new, `SESSION_SECRET` replaces `NEXTAUTH_SECRET`, `NEXTAUTH_URL` is gone.
- README and Postman README are updated to match.

## 9. Non-goals

A `users` collection, tracked repos, history beyond 300 PRs, serving stale data when GitHub fails, GitLab support.

## 10. Build order (about 2 hours)

1. Express scaffold, error middleware, mock mode and the four endpoints.
2. MongoDB connection, session store and Passport login.
3. PR snapshots with the freshness check and in-flight sharing.
4. Verification, README and Postman updates.

## 11. Risks

- Passport login and the OAuth callback need a real GitHub login to prove, which cannot be tested without your OAuth App.
- MongoDB Atlas must be reachable (IP allow-list) from wherever the backend runs.
- Cookies failing across domains after deployment.
