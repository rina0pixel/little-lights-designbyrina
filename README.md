# Little Lights — a Thadingyut night

A cosy 3D festival garden for Myanmar's Festival of Lights. Walk the garden, light lanterns and candles,
share rice balls, watch fireworks, and send wishes that every visitor can see.

Built with Next.js, React and Three.js. Wishes are stored in Supabase.

## Run locally

```bash
npm install
npm run dev
```

Without Supabase settings the app stores wishes in `data/wishes.json` (fine for local testing).

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | What it is |
| --- | --- |
| `SUPABASE_URL` | The Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable key |
| `LITTLE_LIGHTS_TOKEN` | Secret required by the database functions (`private.app_config.token`) |

These are only read on the server and are never sent to the browser.

## Database

Tables `wishes` and `wish_reports` have row level security on with no public policies.
The app talks to them only through `list_wishes`, `add_wish` and `report_wish`, which check the token,
enforce a 20-second cooldown per visitor, and hide a wish after 3 reports. See `supabase/schema.sql`.
