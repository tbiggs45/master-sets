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
  Default: `*`

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
