# Надины 40 — праздничная викторина

Next.js app with Supabase server-side access. The Supabase service-role key is used only by the server API route and must never be exposed in browser code.

## Environment variables
Set these in Vercel Project Settings → Environment Variables:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service_role secret key (server only)
- `HOST_PIN`: a long private PIN for the host

## Database
The app expects the tables `rooms`, `questions`, `players`, `answers` described in the setup steps. RLS is enabled; server routes use the service-role key. Do not add that key to any `NEXT_PUBLIC_` variable.

## Local development
`npm install` then `npm run dev`.
