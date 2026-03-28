# captcha_server

This folder lives **inside the main project**. Bridge server + auto-generator for reCAPTCHA tokens. Deploy as **captcha.monoklix.com** or run locally on port 6003.

## Setup

```bash
cd captcha_server
npm install
```

## Cookies path

- **Default (run from main project):** Uses main project's `backend/cookies` (`../backend/cookies` from this folder). No env needed for local dev.
- **Production / custom path:** Set `COOKIES_DIR` to the absolute path of `backend/cookies` if you deploy this folder separately.
  - Example (Linux): `export COOKIES_DIR=/var/www/your-main-app/backend/cookies`
  - Example (Windows): `set COOKIES_DIR=C:\path\to\main-app\backend\cookies`

## Run (one process, one window)

Bridge and token generator run together in one process. **One command only:**

```bash
node bridge-server.js
```

(Default port 6003; use `--port=6003` to be explicit.)

From the main project, `start-monoklix.bat` (or `start.bat` / `start-esaie.bat`) starts Bridge the same way as the Node server: one window, `node bridge-server.js`.

For PM2 (one process):

```bash
pm2 start bridge-server.js -- --port=6003
```

## Environment

| Variable | Description |
|----------|-------------|
| `COOKIES_DIR` | Absolute path to backend/cookies (e.g. main app's `backend/cookies`) |
| `BRIDGE_SERVER_URL` | (Optional) Used by auto-generator; default `http://localhost:6003` |

## Production (captcha.monoklix.com)

1. Deploy this repo to your server.
2. Set `COOKIES_DIR` to the backend/cookies path on that server.
3. Run bridge (6003) + auto-generator (6004), e.g. with PM2.
4. Point Nginx (or similar) at `https://captcha.monoklix.com` → `http://127.0.0.1:6003`.

Frontend (app.monoklix.com) will use `https://captcha.monoklix.com` in production and `http://localhost:6003` on localhost.
