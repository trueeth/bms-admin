# BMS 4 Admin Web

Standalone Next.js admin dashboard for BMS 4.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://bodxktkpjtjifxaqtkbe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
NEXT_PUBLIC_SUPABASE_TEMPLATE_BUCKET=resume-templates
```

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
Root Directory: BMS_4_Admin_Web
Framework Preset: Next.js
```

Add these Vercel Environment Variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://bodxktkpjtjifxaqtkbe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
NEXT_PUBLIC_SUPABASE_TEMPLATE_BUCKET=resume-templates
```

Then deploy.

## Workflow

1. Create resume profiles and upload each `.docx` resume template.
2. Create bidders and set their user ID/password.
3. Assign profile permissions to bidders.
4. Bidders log into the desktop EXE.
5. The desktop EXE downloads the selected profile template and uploads generated bid logs.
