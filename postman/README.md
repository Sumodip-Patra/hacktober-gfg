# Postman collection

`contribution-tracker.postman_collection.json` tests the backend endpoints and checks the error handling.

## Use it

1. Postman: **Import**, then pick the JSON file.
2. Start the backend (`npm run dev`).
3. **Run collection**. Every request should pass.

## Variables

| Variable | Default | Purpose |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | Backend address (change for a deployed URL) |
| `cookieName` | `connect.sid` | Name of the session cookie (the same on HTTP and HTTPS) |
| `sessionToken` | empty | Session cookie value, only needed when `MOCK` is not `true` |

## Mock mode vs real data

- **Mock:** set `MOCK=true` in `.env.local`. No database or login, leave `sessionToken` empty.
- **Real:** sign in at `/api/auth/github` in a browser, then copy the `connect.sid` cookie value (DevTools > Application > Cookies) into `sessionToken` (Current value).

Never commit a real `sessionToken`; it grants access to the signed-in GitHub account.
