# BMS 4 Admin Web

Standalone Next.js admin dashboard for BMS 4.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
NEXT_PUBLIC_SUPABASE_TEMPLATE_BUCKET=resume-templates
```

Use the same project as the desktop app's `SUPABASE_URL`, or the two will read
different databases.

Run locally:

```bash
npm run dev
```

## Supabase Setup

Before using the admin site or desktop app, run the root project SQL file in Supabase SQL Editor:

```text
../supabase_setup.sql
```

That creates:

- `bidders`
- `resume_profiles`
- `bidder_profile_permissions`
- `bids`
- `resume-templates` storage bucket

## Vercel Deployment

Create a new Vercel project from the GitHub repo and set:

```text
Root Directory: ./
Framework Preset: Next.js
```

Add these Vercel Environment Variables, each with Type `Config` and Production
enabled. `Secret` is rejected because the `NEXT_PUBLIC_` prefix is browser-exposed
by design:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
NEXT_PUBLIC_SUPABASE_TEMPLATE_BUCKET=resume-templates
```

`NEXT_PUBLIC_` values are inlined at build time, so after changing any of them
redeploy with "Use existing Build Cache" unticked. Editing them in the dashboard
alone leaves the live bundle unchanged.

## Workflow

1. Create resume profiles and upload each `.docx` resume template.
2. Create bidders and set their user ID/password.
3. Assign profile permissions to bidders.
4. Bidders log into the desktop EXE.
5. The desktop EXE downloads the selected profile template and uploads generated bid logs.
