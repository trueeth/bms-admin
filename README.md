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
NEXT_PUBLIC_SUPABASE_RESUME_BUCKET=generated-resumes
```

Use the same project as Resume Builder's `SUPABASE_URL`, or the two will read
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
- `blocked_companies`
- `bids`
- `resume-templates` storage bucket (Word templates you upload per profile)
- `generated-resumes` storage bucket (the .docx/.pdf Resume Builder uploads per bid)

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
NEXT_PUBLIC_SUPABASE_RESUME_BUCKET=generated-resumes
```

The resume bucket is private, so downloads are fetched through the browser session
rather than a public URL.

`NEXT_PUBLIC_` values are inlined at build time, so after changing any of them
redeploy with "Use existing Build Cache" unticked. Editing them in the dashboard
alone leaves the live bundle unchanged.

## Workflow

1. Create resume profiles, fill in the resume contact fields and ChatGPT channel, and
   upload each `.docx` resume template.
2. Create bidders and set their user ID/password, and whether a confirmation URL is
   required before their bids count.
3. Assign profile permissions to bidders.
4. Bidders sign into the Resume Builder EXE with that user ID and password.
5. Resume Builder downloads each granted profile's template, and after every build
   uploads the generated `.docx`/`.pdf` plus a bid log row you can download here.
