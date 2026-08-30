# Supabase Setup Guide for Next Review

## Prerequisites

1. Create a Supabase project at https://supabase.com
2. Get your project URL and anon key from the project settings

## Database Schema

Run these SQL commands in your Supabase SQL editor to create the required tables:

```sql
-- Recommended schema: use snake_case column names to avoid Postgres identifier issues.
CREATE TABLE IF NOT EXISTS public.prs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  author_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'MERGED')),
  created_at BIGINT NOT NULL
);

ALTER TABLE public.prs ADD COLUMN IF NOT EXISTS title TEXT;

CREATE INDEX IF NOT EXISTS idx_prs_team_id ON public.prs(team_id);

CREATE TABLE IF NOT EXISTS public.interactions (
  pr_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'REVIEWED')),
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (pr_id, user_id),
  CONSTRAINT interactions_pr_fk FOREIGN KEY (pr_id) REFERENCES public.prs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_pr_id ON public.interactions(pr_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON public.interactions(user_id);

-- Local-dev-only RLS policy so the browser can insert while you are testing the extension.
ALTER TABLE public.prs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_prs" ON public.prs;
CREATE POLICY "allow_all_prs"
  ON public.prs
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_interactions" ON public.interactions;
CREATE POLICY "allow_all_interactions"
  ON public.interactions
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

## Environment Variables

Create a `.env.local` file in your project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Realtime Configuration

1. In your Supabase dashboard, go to **Database** → **Replication**
2. Enable replication for the `prs` and `interactions` tables
3. The extension will automatically subscribe to changes via Supabase Realtime

## Testing Locally

1. Install dependencies: `npm install`
2. Set your environment variables in `.env.local`
3. Run the dev server: `npm run dev`
4. Build the extension: `npm run build`
5. Load the extension in Chrome from the `dist/` directory

## Production Deployment

- Use `VITE_SUPABASE_ANON_KEY` for client-side authentication
- For server-side operations, use `VITE_SUPABASE_SERVICE_KEY` (never expose this in client code)
- Implement Row-Level Security (RLS) policies in Supabase for production
