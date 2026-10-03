# MERN Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next.js backend with Express and MongoDB (MERN) while keeping the four endpoints, their JSON and `lib/stats.js` exactly as they are.

**Architecture:** Express app with Passport GitHub login. Sessions and PR snapshots live in MongoDB. `lib/stats.js`, `lib/mock.js` and the GitHub fetch logic are reused.

**Tech Stack:** Node 20+, Express 5, Mongoose, `connect-mongo`, `express-session`, `passport`, `passport-github2`, `cors`, Node built-in test runner. Plain JavaScript (ES modules).

**Spec:** `docs/superpowers/specs/2026-10-03-mern-backend-design.md` (executors read it and the earlier `2026-10-02` spec, whose API contract, streak definition and error table still apply; the new spec wins on any conflict).

## Global Constraints

- JavaScript only. Only these source files exist: `server.js`, `routes/api.js`, `routes/auth.js`, `lib/auth.js`, `lib/db.js`, `lib/github.js`, `lib/stats.js`, `lib/mock.js`, `lib/errors.js` (+ `lib/stats.test.js`). No extra files or helpers.
- MongoDB is used for sessions and `prsnapshots` only. No `users` collection, no stale fallback.
- `MOCK=true` must run with no MongoDB and no GitHub credentials.
- Snapshot is fresh for 5 minutes. GitHub query, 100 per page, 3 pages max: unchanged from `lib/github.js`.
- OAuth scope `read:user` only. The access token is never returned in any response.
- Error shape and codes unchanged; unexpected errors return 500 `INTERNAL_ERROR`.
- Env vars: `MONGODB_URI`, `SESSION_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `FRONTEND_URL`, `BACKEND_URL`, `PORT` (default 3000), `MOCK`.
- Tests exist for `lib/stats.js` only (the existing 12 must keep passing).
- Work on a new branch `feat/mern-backend` created from `feat/contribution-tracker-api`.

## Review Focus

1. `redirect` pointing to another origin (including `http://localhost:5173.evil.com`) falls back to `FRONTEND_URL`.
2. Passport 0.6+ regenerates the session on login, which would erase the stored redirect unless the callback uses `keepSessionInfo: true`.
3. Concurrent requests for one user share a single GitHub fetch and a single snapshot write.
4. Mock mode starts with no MongoDB and no GitHub variables set (the Passport strategy must not be constructed).
5. The access token never appears in any response body.

## File Structure

```
server.js        app bootstrap (cors, session, passport, routes, error handler)
routes/api.js    /api/me, /repos, /pulls, /stats (Express Router)
routes/auth.js   /api/auth/github, /github/callback, /logout (Express Router)
lib/auth.js      Passport strategy + getUser(req)
lib/db.js        connectDb() + PrSnapshot model
lib/github.js    GraphQL fetch (kept) + getPullRequests(user) (changed in Task 3)
lib/errors.js    ApiError, oneOf, errorHandler
lib/stats.js, lib/mock.js   unchanged
```

Removed: `app/`, `next.config.mjs`, `lib/cors.js`, `lib/cache.js` (in Task 3), packages `next`, `next-auth`, `react`, `react-dom`.

---

### Task 1: Express skeleton and the four endpoints in mock mode

**Files:**
- Modify: `package.json`, `.env.example`, `lib/errors.js`, `lib/auth.js`
- Create: `server.js`, `routes/api.js`
- Delete: `app/`, `next.config.mjs`, `lib/cors.js`, `.next/`

**Interfaces:**
- Produces:
  - `ApiError(status, code, message)` and `oneOf(value, allowed, fallback, name)` (same behavior as now).
  - `errorHandler(err, req, res, next)`: `ApiError` becomes `{ error: { code, message } }` with its status; anything else is logged and becomes 500 `INTERNAL_ERROR`.
  - `getUser(req): User`: returns `mockUser` when `MOCK === 'true'`, otherwise `req.user` or throws `ApiError(401, 'UNAUTHENTICATED', 'Please sign in.')`.
  - `routes/api.js` default-exports a Router with the four endpoints; request and response shapes exactly as in the earlier spec section 4.

- [ ] **Step 1: Switch dependencies.** `npm uninstall next next-auth react react-dom`; `npm install express cors express-session connect-mongo passport passport-github2 mongoose`. In `package.json` set scripts to `"dev": "node --watch --env-file=.env.local server.js"`, `"start": "node server.js"`, `"test": "node --test"` (remove `build`). Delete the files listed above.
- [ ] **Step 2: Rewrite `lib/errors.js` and `lib/auth.js`** per Interfaces (drop `respond`, the `next-auth` imports and the cors import).
- [ ] **Step 3: Implement `routes/api.js`.** Query parameters via `oneOf(req.query.scope ?? null, ...)`; call `getPullRequests` from `lib/github.js` (unchanged in this task, still using `lib/cache.js`); `/pulls` strips `owner` from each item. Express 5 forwards thrown and rejected errors to the error handler, so handlers need no try/catch.
- [ ] **Step 4: Implement `server.js`:** `cors({ origin: process.env.FRONTEND_URL, credentials: true })`, mount `routes/api.js` at `/api`, `errorHandler` last, `app.listen(process.env.PORT ?? 3000)`. No session or Passport yet. Update `.env.example` to the new variable names.
- [ ] **Step 5: Verify.** `MOCK=true FRONTEND_URL=http://localhost:5173 npm run dev`. `curl` all four endpoints (same results as before: 7 external PRs, streak 4); `/api/pulls?state=bogus` returns 400 with the error shape; `curl -i -X OPTIONS localhost:3000/api/me` returns 204 with an `access-control-allow-origin` header. `npm test` shows 12 passing. Run `npx newman run postman/contribution-tracker.postman_collection.json`: all requests pass.
- [ ] **Step 6: Commit** `refactor: replace Next.js with Express, mock mode`

---

### Task 2: MongoDB sessions and GitHub login

**Files:**
- Modify: `lib/auth.js`, `server.js`
- Create: `lib/db.js`, `routes/auth.js`

**Interfaces:**
- Produces:
  - `connectDb(): Promise<void>` (Mongoose connect with `MONGODB_URI`).
  - Passport GitHub strategy registered only when `MOCK !== 'true'`: `clientID`/`clientSecret` from env, `callbackURL = BACKEND_URL + '/api/auth/github/callback'`, `scope: ['read:user']`; the verify callback returns `{ githubId: profile.id, username: profile.username, avatarUrl: profile.photos?.[0]?.value, accessToken }`; `serializeUser` and `deserializeUser` store and return that whole object.
  - `routes/auth.js` default-exports a Router.

- [ ] **Step 1: Implement `lib/db.js`** with `connectDb` only (the model comes in Task 3).
- [ ] **Step 2: Extend `server.js`.** Unless `MOCK === 'true'`, `await connectDb()` before listening. Add `express-session` (`secret: SESSION_SECRET`, `resave: false`, `saveUninitialized: false`, `cookie: { httpOnly: true }`, store `MongoStore.create({ mongoUrl: MONGODB_URI, crypto: { secret: SESSION_SECRET } })`, default store in mock mode), then `passport.initialize()` and `passport.session()`, then mount `routes/auth.js` at `/api/auth` before the API router.
- [ ] **Step 3: Implement `routes/auth.js`.**
  - `GET /github`: store in `req.session.redirect` the `redirect` query value if its origin equals the `FRONTEND_URL` origin, else `FRONTEND_URL` (an invalid URL also falls back); then `passport.authenticate('github')`.
  - `GET /github/callback`: `passport.authenticate('github', { failureRedirect: process.env.FRONTEND_URL, keepSessionInfo: true })`, then `res.redirect(req.session.redirect ?? process.env.FRONTEND_URL)`.
  - `POST /logout`: `req.logout(cb)`, then `req.session.destroy`, then `res.sendStatus(204)`.
- [ ] **Step 4: Verify here without MongoDB** (throwaway script, not committed): mount `routes/auth.js` with `express-session`'s default store, the real strategy and dummy GitHub credentials. Check that `/api/auth/github` redirects to github.com with `scope=read%3Auser` and the callback URL; that `?redirect=http://localhost:5173/dash` is kept while `http://localhost:5173.evil.com/x` and `not a url` fall back to `FRONTEND_URL`; that the callback with no code redirects to `FRONTEND_URL`. Also confirm `MOCK=true npm run dev` still boots with no GitHub variables.
- [ ] **Step 5: Manual, left to the user:** create the Atlas cluster and set `MONGODB_URI` (allow the host's IP in Atlas); update the GitHub OAuth App callback URL to `http://localhost:3000/api/auth/github/callback`; sign in through `/api/auth/github`, then open `/api/me`.
- [ ] **Step 6: Commit** `feat: github login with mongodb sessions`

---

### Task 3: PR snapshots in MongoDB

**Files:**
- Modify: `lib/db.js`, `lib/github.js`
- Delete: `lib/cache.js`

**Interfaces:**
- Consumes: `fetchAll(user)` and the GraphQL code already in `lib/github.js`.
- Produces:
  - `PrSnapshot` Mongoose model: `githubId` (String, unique, required), `prs` (Array), `fetchedAt` (Date).
  - `getPullRequests(user): Promise<Pr[]>`: returns `mockPrs()` in mock mode; otherwise returns the snapshot's `prs` when `Date.now() - fetchedAt < 5 minutes`; else runs `fetchAll`, upserts the snapshot with `fetchedAt: new Date()`, and returns the PRs. Concurrent callers for the same `githubId` share one pending promise (a module-level Map, entry removed when it settles, success or failure).

- [ ] **Step 1: Add the `PrSnapshot` model** to `lib/db.js`.
- [ ] **Step 2: Rewrite `getPullRequests`** in `lib/github.js` per Interfaces; remove the `cached` import; delete `lib/cache.js`.
- [ ] **Step 3: Verify here without MongoDB** (throwaway script, not committed): replace `PrSnapshot.findOne` and `PrSnapshot.updateOne` with in-memory stubs and `globalThis.fetch` with a fake GraphQL response. Check: a fresh snapshot is returned with zero fetches; a stale snapshot triggers one fetch and one `updateOne`; three concurrent calls for one user trigger exactly one fetch and one `updateOne`; a failing fetch is not stored and the next call retries.
- [ ] **Step 4: Manual, left to the user:** with Atlas connected, call `/api/pulls` twice within 5 minutes and confirm a `prsnapshots` document exists with an unchanged `fetchedAt` after the second call.
- [ ] **Step 5: Commit** `feat: store PR snapshots in mongodb`

---

### Task 4: Docs and Postman

**Files:**
- Modify: `README.md`, `postman/README.md`, `postman/contribution-tracker.postman_collection.json`, `.env.example`

- [ ] **Step 1: Update `README.md`:** tech stack (Express, MongoDB, Passport), quick start (Node 20+, MongoDB Atlas, `.env.local` variables from Global Constraints), login routes (`/api/auth/github?redirect=`, `/api/auth/logout`), callback URL, the 5-minute snapshot, project structure from this plan, and the cross-domain cookie note (`sameSite: 'none'`, `secure: true`, `app.set('trust proxy', 1)` in `server.js` when frontend and backend are on different domains).
- [ ] **Step 2: Update the Postman collection and README:** default `cookieName` is `connect.sid`; text mentions `/api/auth/github` instead of `/api/auth/signin`; HTTPS note keeps working (`connect.sid` is unchanged on HTTPS).
- [ ] **Step 3: Verify.** `npm test` passes 12; `MOCK=true npm run dev` plus `npx newman run postman/contribution-tracker.postman_collection.json` passes; no mention of Next.js or `next-auth` remains (`grep -ri "next" README.md postman` shows nothing relevant).
- [ ] **Step 4: Commit** `docs: update for MERN stack`
