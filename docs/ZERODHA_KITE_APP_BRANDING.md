# TradingSmart / custom name on the Zerodha login page

When users click **Connect broker** (Zerodha), the browser opens:

`https://kite.zerodha.com/connect/login?api_key=...`

That screen is **hosted entirely by Zerodha**. ChartMate, OpenAlgo, and Supabase **cannot** change its title, logo, or wording via code or query parameters.

## How to show “TradingSmart Trading Gateway” and your logo

1. Sign in to the **Zerodha Kite Connect developer** portal (the account that **owns** the API key used in production — often the same key configured in OpenAlgo as the Zerodha / Kite `BROKER_API_KEY` or equivalent).
2. Open your **Kite Connect app** (the one whose `api_key` appears in the login URL).
3. Edit the app:
   - Set the **app name** / display name to something like **TradingSmart Trading Gateway** (exact label depends on what Zerodha’s form calls it — “App name” or similar).
   - Upload your **TradingSmart logo** where the portal allows an app icon/logo (follow Zerodha’s size/format rules shown there).
4. Save. New logins will show the updated name and logo on `kite.zerodha.com/connect/login` for **that** `api_key`.

## Important

- Branding is **per API key**. If you still use a key registered as “ChartMate …”, users will keep seeing ChartMate until you change that app in the developer console **or** switch production to a **new** Kite Connect app registered under TradingSmart with a new key (and update OpenAlgo/env accordingly).
- Redirect URLs registered for that app must still match your OpenAlgo Zerodha callback (e.g. `https://your-openalgo-host/zerodha/callback`).

## In-app copy (optional)

Text **inside** ChartMate (modals, broker connect section) can say “TradingSmart” independently; that only affects our UI **before** the redirect, not Zerodha’s login page.
