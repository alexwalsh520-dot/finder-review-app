# Finder Review App

Separate Vercel review desk for `finder_v1`.

## What it does

- shows the VA review queue
- shows your owner queue
- exports approved leads in the exact CSV format:
  - `first_name`
  - `email`
  - `instagram_username`
- shows recent worker files and status
- reflects Smartlead sent-state automatically

## Required env vars

Copy `.env.example` into your Vercel project env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMARTLEAD_API_KEY`
- `FINDER_OUTPUT_BUCKET`
- `SESSION_SECRET`
- `OWNER_EMAIL`
- `OWNER_PASSWORD_HASH`
- `REVIEWER_EMAIL`
- `REVIEWER_PASSWORD_HASH`
- `APP_URL`

## Password hashes

Generate a hash with:

```bash
npm run hash-password -- "your-password-here"
```

Put the resulting value into:

- `OWNER_PASSWORD_HASH`
- `REVIEWER_PASSWORD_HASH`

## Local dev

```bash
npm install
npm run dev
```

## Production check

```bash
npm run build
```
