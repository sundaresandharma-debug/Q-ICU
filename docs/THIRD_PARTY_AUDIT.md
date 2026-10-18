# Third-party SDK and asset audit

Last reviewed: 18 October 2026. Re-run `npm audit` and `pip-audit -r requirements.txt` before each release (CI does both on every push).

## Browser

No third-party scripts, tags, pixels, chat widgets or CDNs are loaded. The Content Security Policy in `next.config.mjs` only allows scripts from our own origin and API calls to our own origin and our Supabase project.

| Package | Version | Runs in | Why we need it | Data it touches |
| --- | --- | --- | --- | --- |
| next | 16.3.8 | Server and browser | Framework | None of its own. Telemetry disabled in CI with `NEXT_TELEMETRY_DISABLED`. Set it in Vercel too. |
| react, react-dom | 19.3.0 | Browser | UI | None |
| @supabase/supabase-js | 2.117.0 | Server and browser | Database and sign-in | Email, session tokens, the user's own rows (RLS) |
| @supabase/ssr | 0.12.7 | Server and browser | Stores the session in a cookie | Session cookie |
| @fontsource/ibm-plex-sans, @fontsource/ibm-plex-mono | 5.1.1 | Static files | Self-hosted fonts | None. No request to Google Fonts. |
| server-only | 0.0.1 | Build | Stops server modules being bundled for the browser | None |

Removed in this review: `lucide-react` (icon pack, replaced by plain text labels and one hand-drawn SVG).

## Server (Python)

| Package | Why | Notes |
| --- | --- | --- |
| fastapi, starlette, uvicorn, pydantic | HTTP API and input validation | Starlette pinned to 1.7.0 to clear 2026 advisories |
| numpy, scikit-learn | Synthetic risk model | Trained at start-up on generated data, no external data |
| qiskit, qiskit-aer | QAOA circuit and local simulator | Runs locally. No IBM Quantum account or token is used, and no data leaves the server |

## Hosted services (data processors)

| Service | Purpose | Personal data |
| --- | --- | --- |
| Supabase | Auth, Postgres, rate-limit store | Account email, profile, saved scenarios, telemetry without IPs |
| Vercel | Hosts the Next.js app | Request logs kept by Vercel under its own policy |
| Backend host (Render, Fly.io or similar) | Runs the optimizer | Patient records in memory for the length of a request |
| GitHub Actions | CI and encrypted nightly backups | Encrypted database dump, 30-day retention |

## Fonts and images

| Asset | Licence | Source |
| --- | --- | --- |
| IBM Plex Sans, IBM Plex Mono | SIL Open Font License 1.1 (commercial use allowed) | `@fontsource` npm packages, licence file in `node_modules/@fontsource/*/LICENSE` |
| Logo mark and favicon (`components/Logo.tsx`, `app/icon.svg`) | Original work for this project | Drawn in SVG by the team |

The site uses no stock photos, illustrations or icon sets. Any image added later must have alt text and a recorded licence in this table.
