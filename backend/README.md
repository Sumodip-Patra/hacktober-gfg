# GitHub Contribution Tracker (Backend)

A MERN-stack backend (Express, MongoDB, Node.js; the React frontend lives in a separate app) that shows a user's open source contributions: the repos they have sent pull requests to, the status of each PR, and streak and stats. Users sign in with GitHub.

## Features

- GitHub OAuth login (read-only, public data only)
- List of repos you have contributed to, with PR and merge counts
- PR tracker with `open`, `merged` and `closed` states, filterable by repo
- Stats: totals, current and longest contribution streak, per-repo counts, activity by day
- Login sessions and PR snapshots stored in MongoDB
- Mock mode with fixture data (no MongoDB, no login), so a frontend can be built immediately

## Tech stack

Node.js, Express 5, MongoDB (Mongoose), Passport (GitHub OAuth), `express-session` with `connect-mongo`, GitHub GraphQL API, Node built-in test runner.

## Quick start

Requires Node.js 20.6 or newer.

```bash
npm install
cp .env.example .env.local     # Windows PowerShell: copy .env.example .env.local
npm run dev
```

### Try it without MongoDB or GitHub login (mock mode)

Put these two lines in `.env.local` and run `npm run dev`:

```
MOCK=true
FRONTEND_URL=http://localhost:5173
```

Open <http://localhost:3000/api/stats>. The endpoints return fixture data.

### Use real GitHub data

1. **MongoDB:** create a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, add a database user, allow your IP address, and copy the connection string into `MONGODB_URI` (add a database name, for example `.../contribution-tracker?retryWrites=true`).
2. **GitHub OAuth App:** GitHub **Settings > Developer settings > OAuth Apps > New OAuth App**.
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
   Copy the Client ID and generate a client secret.
3. **Session secret:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Fill in `.env.local` (see below), set `MOCK=false`, and restart.
5. Open <http://localhost:3000/api/auth/github> and approve. You are then redirected to `FRONTEND_URL`; if your frontend is not running that page will not load, which is fine. Open <http://localhost:3000/api/me> in the same browser to confirm you are logged in.

## Environment variables

| Variable | Description |
|---|---|
| `MOCK` | `true` serves fixture data with no database or login; `false` uses MongoDB and real GitHub |
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Random string that signs and encrypts login sessions |
| `GITHUB_ID` | GitHub OAuth App client ID |
| `GITHUB_SECRET` | GitHub OAuth App client secret |
| `FRONTEND_URL` | The one frontend origin allowed to call the API and to be redirected to after login |
| `BACKEND_URL` | Public address of this backend (used for the GitHub callback URL) |
| `PORT` | Port to listen on (default 3000) |

`.env.local` is git-ignored. Never commit real secrets.

## API

All endpoints return JSON and require a login session (except in mock mode). Optional query parameter `scope=external|all` applies to `repos`, `pulls` and `stats`: `external` (default) excludes repos owned by the signed-in user.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/me` | Signed-in user: `username`, `avatarUrl`, `profileUrl` |
| GET | `/api/repos` | Repos with PRs: `fullName`, `url`, `prCount`, `mergedCount`, `lastActivityAt` |
| GET | `/api/pulls` | PRs. Filters: `state=open\|merged\|closed\|all`, `repo=owner/name` |
| GET | `/api/stats` | `totals`, `streak`, `perRepo`, `activityByDay` |
| GET | `/api/auth/github?redirect=<url>` | Start GitHub login; `redirect` is only honored for the `FRONTEND_URL` origin |
| GET | `/api/auth/github/callback` | GitHub returns here |
| POST | `/api/auth/logout` | End the session (204) |

Example `GET /api/stats`:

```json
{
  "totals": { "totalPrs": 20, "open": 3, "merged": 12, "closedUnmerged": 5, "repos": 7 },
  "streak": { "current": 4, "longest": 9 },
  "perRepo": [{ "repo": "owner/name", "merged": 3, "open": 1 }],
  "activityByDay": [{ "date": "2026-09-30", "count": 2 }]
}
```

### Streak definition

A day counts if you opened or merged at least one PR that day (UTC dates). `current` is the run of consecutive days ending today or yesterday; `longest` is the best run in the fetched data. Stats use up to your 300 most recent public PRs.

### Errors

Every error uses one shape:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Please sign in." } }
```

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid query parameter value |
| 401 | `UNAUTHENTICATED` | Not signed in, or the GitHub token was revoked |
| 429 | `RATE_LIMITED` | GitHub rate limit reached |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `UPSTREAM_ERROR` | GitHub is unavailable |

## How data is stored

- `sessions`: encrypted login sessions (managed by `connect-mongo`). The GitHub token stays here and is never returned by the API.
- `prsnapshots`: each user's PRs from GitHub. A snapshot younger than 5 minutes is served as is; an older one triggers one fresh GitHub fetch, even if several requests arrive at once.

## Calling the API from a frontend

Send requests with credentials so the session cookie is included:

```js
fetch(`${API_URL}/api/stats`, { credentials: 'include' });
```

To log in, send the user to `${API_URL}/api/auth/github?redirect=${encodeURIComponent(FRONTEND_URL)}`. To log out, `POST ${API_URL}/api/auth/logout` with `credentials: 'include'`.

## Testing

```bash
npm test
```

Unit tests cover the streak, totals and filtering logic in `lib/stats.js`. A Postman collection that exercises every endpoint (including error cases) is in [`postman/`](postman/).

## Project structure

```
server.js        Express app: cors, sessions, Passport, routes, error handler
routes/api.js    /api/me, /repos, /pulls, /stats
routes/auth.js   GitHub login, callback, logout
lib/auth.js      Passport GitHub strategy and getUser(req)
lib/db.js        MongoDB connection and the PrSnapshot model
lib/github.js    GitHub GraphQL client and snapshot logic
lib/stats.js     Pure functions: streak, totals, filters, grouping
lib/errors.js    ApiError, query validation, error handler
lib/mock.js      Fixture data for mock mode
docs/superpowers Design specs and implementation plans
postman/         Postman collection
```

## Deployment notes

- Set all environment variables on your host (leave `MOCK` unset or `false`) and start with `npm start`.
- In Atlas, allow the host's IP address (or `0.0.0.0/0` for a hackathon demo).
- Update the GitHub OAuth App callback URL to `https://<your-host>/api/auth/github/callback` and set `BACKEND_URL` to that host.
- If the frontend and backend are on different domains in production, add `app.set('trust proxy', 1)` and set the session cookie to `sameSite: 'none', secure: true` in `server.js`, otherwise login will not persist.

## Limitations

- Only public GitHub data (OAuth scope `read:user`).
- At most 300 PRs per user, and no history beyond what GitHub returns at the last refresh.
- GitHub only (no GitLab merge requests).
