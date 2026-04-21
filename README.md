# Finder Review App

Separate Vercel review desk for `finder_v1`.

This repository is the deployed approval-desk app for:

- `https://finder-review-app.vercel.app`

If you are in the parent workspace (`/Users/alexwalsh/Documents/New project`), this is the repo you should use for approval-desk Git, build, and deploy work.

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

## Release safety

Before shipping, run:

```bash
npm run doctor
npm run build
```

`npm run doctor` verifies that:

- you are inside the `finder-review-app` Git repo
- the origin remote points at the approval-desk GitHub repo
- the linked Vercel project is `finder-review-app`
- the working tree is clean before a release

If you want the identity checks without the clean-tree requirement while you are actively editing, run:

```bash
npm run doctor -- --allow-dirty
```

## Production check

```bash
npm run build
```
