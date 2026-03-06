# OpenAlgo changes for "Log in with Zerodha" from ChartMate

So users never leave ChartMate to copy a token, ChartMate starts the Zerodha login and OpenAlgo must do two things.

## 1. GET `/api/v1/zerodha/login-url`

- **Query:** `return_url` (required) — full URL where the user should land after login, e.g. `https://yourapp.com/broker-callback`.
- **Response:** `{ "url": "https://kite.zerodha.com/connect/login?v=3&api_key=YOUR_API_KEY&state=ENCODED_RETURN_URL" }`.
- Build the Kite URL with your `BROKER_API_KEY` and pass `return_url` as the `state` query param (URL-encoded). Optional: protect with `X-Chartmate-Secret` if you want.

## 2. Zerodha callback: redirect to ChartMate with token

- Your existing Zerodha callback (e.g. `/zerodha/callback`) receives `request_token` and `state` from Zerodha.
- Exchange `request_token` for `access_token` as you do today.
- Instead of (or in addition to) showing the token on a page, **redirect the user** to the URL in `state` with the token in the **hash** so it is not sent to server logs:
  - `REDIRECT_TO = state + "#broker_token=" + access_token + "&broker=zerodha"`
  - Example: `https://yourapp.com/broker-callback#broker_token=xxx&broker=zerodha`
- ChartMate’s `/broker-callback` page reads `broker_token` and `broker` from the hash, saves the integration, and redirects to `/predict`.

## Summary

| Step | Who | Action |
|------|-----|--------|
| 1 | ChartMate | User clicks "Log in with Zerodha"; app calls Supabase edge function which calls OpenAlgo `GET /api/v1/zerodha/login-url?return_url=...` and gets `url`. |
| 2 | ChartMate | Redirects user to `url` (Kite login). |
| 3 | User | Logs in on Zerodha. |
| 4 | Zerodha | Redirects to OpenAlgo `/zerodha/callback?request_token=...&state=...`. |
| 5 | OpenAlgo | Exchanges `request_token` for `access_token`, then redirects to `state#broker_token=ACCESS_TOKEN&broker=zerodha`. |
| 6 | ChartMate | User lands on `/broker-callback`, token is saved, user is sent to `/predict`. |

No token copy/paste: everything happens by redirects.
