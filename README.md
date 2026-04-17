# Pokemon Card Tracker

Next.js Pokedex checklist with Supabase-backed accounts and per-user progress.

## Run Locally

```bash
npm install
npm run build
npm start
```

Open:

```text
http://localhost:3000
```

For local database-backed login and progress, create `.env.local`:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key
```

## Supabase Setup

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run `supabase/schema.sql`.
4. Copy the project API URL into `SUPABASE_URL`.
5. Copy the secret/service-role key into `SUPABASE_SERVICE_ROLE_KEY`.

The service-role key must only be used on the server. Do not expose it in browser code.

## Deploy

Deploy the GitHub repo on Vercel as a Next.js project.

Use these environment variables in Vercel:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key
```

Add them for Production before deploying. If you change environment variables later, redeploy the project.

## Updating The Live App

```bash
git add -A
git commit -m "Describe the change"
git push origin main
```

Vercel will deploy the latest `main` branch automatically when the project is connected to GitHub.
