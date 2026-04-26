# Master Set Scan Backend

This is the smallest backend needed to keep card scanning easy for normal users.

## Why it exists

Instead of asking each user for their own model API key, the app can send the card image to this backend and the backend talks to Anthropic with your server-side key.

## Run it

```bash
cd Master Sets/backend
ANTHROPIC_API_KEY=sk-ant-... node server.js
```

Optional environment variables:

- `PORT`
  Default: `8787`
- `ALLOWED_ORIGIN`
  Default: `*` (set a specific origin or comma-separated allow-list in production)
- `MAX_BODY_BYTES`
  Default: `8388608` (8MB request cap)
- `MAX_IMAGE_BASE64_LENGTH`
  Default: `11000000` (~8MB JPEG payload cap)
- `RATE_LIMIT_MAX`
  Default: `60` requests per window per client IP
- `RATE_LIMIT_WINDOW_MS`
  Default: `60000` (1-minute window)
- `ANTHROPIC_TIMEOUT_MS`
  Default: `30000` (30-second model request timeout)
- `ANTHROPIC_MODEL`
  Default: `claude-haiku-4-5-20251001` (overrideable model name so deploys can switch safely)

Additional behavior:
- `POST /identify-card` requires `Content-Type: application/json`.
- `imageBase64` accepts either raw base64 bytes or `data:image/...;base64,...` format.

## Endpoints

- `GET /health`
- `POST /identify-card`

Request body:

```json
{
  "imageBase64": "..."
}
```

## App setup

In the app settings, enter a backend URL such as:

- Simulator on the same Mac: `http://127.0.0.1:8787`
- Real device on same Wi-Fi: `http://YOUR-MAC-LAN-IP:8787`

If no backend URL is configured, the app can still use the old direct API-key path for development.
