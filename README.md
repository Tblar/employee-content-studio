# Employee Content Studio

A GitHub-ready starter dashboard for staff to propose website content changes and an owner to approve or reject them. Built with Next.js App Router and Supabase Auth/Postgres.

## What is included
- Responsive employee dashboard
- Email magic-link login
- Form-based content requests for pages, blog/news, products and services
- Pending and review-history views
- Owner-only approval RPC with database-level permission checks
- Row-level security policies in `supabase/schema.sql`

## Important limitations
This is a starter project, not a finished CMS. Approval currently creates a record in the `content_items` database table; it does **not** automatically alter your existing website until you connect your public Next.js pages to that table. It currently has a form editor, not drag-and-drop page layout editing. It also does not yet include direct image uploads, rich-text editing, edit-existing-content, revision diffs or rollback UI. Complete those before relying on it for production content.

## Requirements
- Node.js LTS and Git
- A Supabase project
- Your existing website hosted with HTTPS for production

## 1. Run locally
```bash
npm install
cp .env.example .env.local
```
Put your Supabase project URL and publishable/anon key in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```
Never use the Supabase `service_role` key in a browser app or any `NEXT_PUBLIC_` variable.

Then run:
```bash
npm run dev
```
Open http://localhost:3000.

## 2. Set up Supabase
1. Create a project at https://supabase.com.
2. In SQL Editor, run `supabase/schema.sql`.
3. In Authentication URL settings, add `http://localhost:3000` as a redirect URL. Add the production dashboard URL after deployment.
4. Enable email magic links and configure email delivery appropriate for your team.
5. Sign in once with your own email to create the auth user.
6. In SQL Editor, replace `YOUR_OWNER_EMAIL` and run:
```sql
insert into public.profiles(id,display_name,role)
select id,'Site Owner','owner' from auth.users where email='YOUR_OWNER_EMAIL'
on conflict(id) do update set role='owner';
```
7. Have each employee sign in once, then add them to `public.profiles` with their Auth user UUID and role `editor`. Use `reviewer` for read-only staff. Example:
```sql
insert into public.profiles(id,display_name,role)
values('EMPLOYEE_AUTH_USER_UUID','Employee Name','editor')
on conflict(id) do update set role='editor';
```
8. Test using separate owner and employee accounts. Confirm employees cannot publish or change roles by calling the database directly.

## 3. Connect to GitHub
Create an empty GitHub repository, then run these commands from this project folder:
```bash
git init
git add .
git commit -m "Initial employee content studio"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```
Do not commit `.env.local`, passwords, API secrets or signing keys.

## 4. Deploy
Deploy this as a separate Next.js app first using a provider that supports Next.js. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the host's environment-variable settings. Add the deployed dashboard URL to Supabase Auth redirect URLs. Test sign-in, submission, rejection and approval before inviting the team.

## 5. Connect your public website
Your existing Next.js site can read approved records with the publishable/anon key; RLS exposes only published rows. Example server-side query:
```ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
export async function getPublishedContent() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id,type,title,slug,published_data,published_at')
    .eq('published', true)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return data;
}
```
Map the result into your existing page components. Don't replace live pages until content mapping, slugs, SEO and caching/revalidation are tested.

## Before production
- Review RLS policies and SQL in a test project first.
- Add edit-existing-content support using stable content IDs.
- Add a revision/diff view and rollback plan.
- Add validated uploads to Supabase Storage with file size/type limits.
- Add rich-text editing and a safe, allow-listed page-section builder.
- Add audit logs and owner notification emails.
- Test authorization at database/API level, not only by hiding UI buttons.
- Configure backups, monitoring, account recovery and employee offboarding.
