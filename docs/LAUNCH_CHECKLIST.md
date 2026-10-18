# Launch checklist

Where each launch requirement lives in the code, and what still needs a person to do.
Items marked **Before launch** need a manual step (accounts, secrets or legal details).

## Legal and consent

| Requirement | Where |
| --- | --- |
| Privacy Policy | `app/legal/privacy/page.tsx` |
| Terms of Service | `app/legal/terms/page.tsx` |
| Refund Policy | `app/legal/refunds/page.tsx` (free product, states what happens if that changes) |
| Cookie Policy | `app/legal/cookies/page.tsx` (lists every cookie) |
| Cookie consent banner | `components/ConsentBanner.tsx`. Two equal buttons, nothing pre-selected, reopen from "Cookie settings" in the footer, Global Privacy Control respected (`lib/consent.ts`) |
| Form consents | Sign-up: unticked boxes for age and terms (`app/signup/signup-form.tsx`), enforced again by the database trigger `handle_new_user`, with the accepted policy version and time stored on the profile. Data request form: explicit consent to use the email. Onboarding: confirmation that only synthetic data will be entered |
| Age consent for children's data | 18+ confirmation at sign-up (form and database). Privacy Policy "Children" section. Onboarding and the tool banner forbid data about real minors |
| Business details | `lib/site.ts`, shown in the footer and every legal page. **Before launch:** set `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_POSTAL_ADDRESS`, `NEXT_PUBLIC_JURISDICTION` |
| Data deletion requests | Self-serve: Delete account on `/account`. Without an account: `/data-request` form stored in `data_requests`. Export: `/api/account/export` |
| Delete account button | `app/account/account-settings.tsx`, `app/api/account/delete/route.ts`. Typed confirmation, cascades to all user rows |

## Honesty and trust

| Requirement | Where |
| --- | --- |
| Data minimization | Sign-up asks only for email and password. Display name optional. Patient IDs restricted to codes (no names or emails) and states to a fixed vocabulary, checked in the browser (`components/icu/model.ts`), the API (`backend/main.py`, unknown fields rejected) and tests. Imports read only the columns the optimizer uses. Telemetry stores no IP, user ID, user agent or query string. Rate limiting stores a salted hash of the IP for one day |
| Third-party SDK audit | `docs/THIRD_PARTY_AUDIT.md`. `lucide-react` removed, Next.js upgraded off versions with critical advisories, Starlette pinned past 2026 advisories. CI runs `npm audit` and `pip-audit` |
| No dark patterns or hidden fees | Equal-weight consent buttons, no pre-ticked boxes, deletion as easy as sign-up, no paid features. Footer and Terms state the product is free |
| No fake reviews or unsupported claims | No testimonials, user counts or logos. Landing page lists the prototype's limits, including that a sorted list solves the current objective as well as QAOA |
| Licensed fonts and images | IBM Plex (OFL 1.1, self-hosted). Logo is original SVG. No stock images. See `docs/THIRD_PARTY_AUDIT.md` |

## Accessibility

| Requirement | Where |
| --- | --- |
| Alt text | No raster images. Decorative SVGs are `aria-hidden`; the logo link has an accessible name. `check-design.mjs` and the audit doc require alt text for any image added later |
| Colour contrast | Tokens in `app/globals.css`, every pair checked to WCAG AA by `npm run check:contrast` in CI (lowest text pair 5.79:1) |
| Keyboard navigation | Skip link, visible `:focus-visible` outline, native buttons and links only, the Add patient dialog traps focus, closes on Escape and returns focus. Form errors are linked with `aria-describedby` and announced with `role="alert"` |
| Mobile layout | Single-column layouts below 600 to 860px, 16px side gutter, 44px touch targets, wide tables scroll inside their own container |

## Product basics

| Requirement | Where |
| --- | --- |
| Real login and logout | Supabase Auth with email and password. `app/login`, `app/auth/signout/route.ts` (POST, same-origin check). Session refreshed and pages guarded in `proxy.ts` |
| Password reset | `app/forgot-password` sends a link (same message whether or not the email exists), `app/auth/callback/route.ts` verifies it, `app/reset-password` sets the new password and signs out all sessions |
| Onboarding flow | `app/onboarding`: name, data rules, start. The dashboard redirects there until it is complete |
| Loading states | Route `loading.tsx` files, button labels change while working, `aria-busy` on sections |
| Skeleton loaders | `components/Skeleton.tsx`, used for the dashboard, saved scenarios, results while the optimizer runs. Pulse is turned off for `prefers-reduced-motion` |
| Empty states | No patients, no saved scenarios, no allocations. Each says what to do next |
| Clear error messages | `friendlyAuthError` in `lib/validation.ts`, field-level messages that say the allowed range, API errors that say what to change. Error pages show a reference code |
| Form validation | Shared rules in `lib/validation.ts` and `components/icu/model.ts`, repeated on the server (route handlers, Pydantic) and in the database (check constraints) |
| Custom 404 page | `app/not-found.tsx` |
| Error tracking | `components/Telemetry.tsx` catches uncaught errors and React error boundaries (`app/error.tsx`, `app/global-error.tsx`) and stores them in `error_events`. The backend logs one JSON line per error with a request ID returned to the user |
| Analytics | First-party page counts in `page_views`, only after consent. Query with SQL in Supabase |

## Security and operations

| Requirement | Where |
| --- | --- |
| Rate limiting | Next.js routes: `lib/rate-limit.ts` backed by the `rate_limit_hit` Postgres function (works across serverless instances). Backend: per-client sliding window in `backend/main.py`. Supabase Auth has its own limits for sign-in and emails. Tested in `tests/test_api.py` and `supabase/tests/rls.sql` |
| Row level security | `supabase/migrations/0001_init.sql`. Every table has RLS on. Users reach only their own profile and scenarios. Consent columns are read-only. Tested by `supabase/tests/rls.sql` in CI |
| API keys off the frontend | Backend URL and key, service-role key and rate-limit salt are server-only env vars. The browser calls `/api/optimize` on our own server. Only the Supabase URL and anon key are public, which Supabase designs for |
| Database backups | `.github/workflows/db-backup.yml`: nightly `pg_dump`, AES-256 encrypted, kept 30 days, then applies retention rules. **Before launch:** add secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`, set repository variable `ENABLE_DB_BACKUP=true`. Supabase Pro also keeps its own daily backups |

## Supabase dashboard settings (before launch)

1. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
2. Authentication > URL configuration: Site URL = your domain. Add `https://your-domain/auth/callback` to redirect URLs.
3. Authentication > Providers > Email: keep "Confirm email" on. Turn on "Secure password change" and leaked password protection.
4. Authentication > Rate limits: review the email and sign-in limits.
5. Set a custom SMTP sender so confirmation emails come from your domain.

## Restore a backup

```sh
gpg --decrypt q-icu-YYYYMMDDTHHMMSSZ.dump.gpg > backup.dump
pg_restore --clean --if-exists --no-owner --dbname "$TARGET_DB_URL" backup.dump
```

Test a restore into a scratch Supabase project at least once before launch.
