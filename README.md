# ADC Volunteers System

The registration and coordination website for ADC volunteers
(Interface Build Specification v1.0). Volunteers register from
any phone. Every record is tied to INEC's geography down to the polling unit.
Coordinators at every level work from one scoped workspace.

Built with Next.js 16 (App Router), Tailwind 4 and PostgreSQL (Neon in production).
For local development an embedded Postgres runs inside Node, so nothing needs
installing beyond Node, and the live database is never touched.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

The system starts **empty**. To create the first Super Admin account (and remove
any data already there), stop the server and run `npm run clean`; for the live
database run `npm run db:clean`. Both ask for the admin's name, phone and password
and for the word DELETE before changing anything.

To try the system with **synthetic demo data** (40 groups, about 1,400 volunteers,
activities, media and tasks; no real people) on your own machine, set `SEED_DEMO=1`
and run `npm run seed -- --reset`. Never load demo data into the live database.

Until an SMS provider is connected (`SMS_PROVIDER=console`), nothing is texted:
one-time codes for registration and sign-in are shown on screen instead. Setting
`SMS_PROVIDER` (and implementing `deliver()` in `lib/notify.js`) switches this off.

### Demo sign-ins

Every account uses the password `Adc2027!demo`. A code is then shown on screen
as the second factor.

| Role | Phone |
|---|---|
| Super Admin (ADC Supervising Body) | 0800 000 0001 |
| Zonal coordinator (North Central) | 0800 000 0002 |
| State coordinator (FCT) | 0800 000 0003 |
| LGA coordinator (Bwari) | 0800 000 0004 |
| Ward coordinator (Kubwa) | 0800 000 0005 |
| Directorate head (Youth) | 0800 000 0006 |
| Field agent (Bwari) | 0800 000 0008 |
| State coordinator (Kano) | 0800 000 0009 |
| Support group account, Kubwa Youth Vanguard (ADC-SG-37-0412, join code KBW412). Sign in at `/login` with no code. | kubwayouth@example.com |

## Volunteers: register by answering simple questions

The public website is for volunteers only; there is no support group registration on it.

- **Home page** (`/`): a **Ways to help** section lists every role with a one-line description. "Volunteer for this" opens the form with that role already chosen (`/volunteer?role=pu_agent`).
- **Registration** (`/volunteer`) asks one question per screen, about 3 minutes in all. It starts with "What would you like to volunteer for?", then name, phone, gender, date of birth, state → LGA → ward → polling unit, PVC, languages, availability, smartphone, best way to reach you, and a final check-and-agree. Choices move on by themselves, Enter continues, progress saves on the phone, and any problem the server finds sends the person back to that question.
- The question engine is `components/forms/QuestionFlow.jsx`. The questions themselves are plain data in `app/(site)/volunteer/VolunteerForm.jsx`, so adding, removing or reordering one is a one-line change.

Old `/register` links redirect to `/volunteer`. Support groups registered earlier, with their dashboards and certificates, still work for coordinators in the workspace and at `/login`, but nothing on the public site links to them.

## What's where

| Area | Route | Who |
|---|---|---|
| Public site: home, register a group (Flow A), volunteer (Flow B), find a group, check status, privacy, help | `/`, `/register`, `/volunteer`, `/groups`, `/status`, `/privacy`, `/help` | Anyone |
| Invite links | `/join/KBW412` | Anyone |
| Polling unit agent page (election day) | `/pu-agent` | Rostered agents, by phone code |
| Coordinator workspace | `/workspace/**` | Signed-in coordinators |

The workspace sections are listed below. Each role sees only the sections it can
use.

- **Overview.** Four headline tiles (volunteers, verified, PVC ready, polling unit coverage), each with its change on the period before, a 12-week trend or a coverage meter, and a link to the matching list. Beside the 90-day registration chart is a To do list, most urgent first. Below them: where every registration stands in verification, election-day readiness (agents willing against those needed, polling units with a confirmed agent), the coverage map, channels, roles, gender and age, and a by-area table with the verification backlog, a coverage meter per area, and the areas with nobody yet. The national admin (the super admin) also gets an Administration panel: approvals waiting, the team by role, failed sign-ins in the last 24 hours, and the latest actions in plain words.
- **Verification.** Groups and volunteers, oldest first, with duplicate warnings and a one-tap Verify, Request info or Reject. Verifying records the method used; rejecting needs a reason.
- **Volunteer directory.** Status tabs with counts, a summary of the current selection, and filters for search (name, ID or phone number), zone → state → LGA → ward (starting from the viewer's own area), role, PVC, gender, age band, availability, language, smartphone, phone confirmed, support group, channel, registration dates, no polling unit and possible duplicates. Every filter is in the URL, so a view can be bookmarked or shared. Columns sort, pages hold 25, 50 or 100, and rows can be selected. On a phone the list becomes cards.
- **Downloads.** Choose Excel (.xlsx) or CSV and the columns (presets: Standard, Contact list, Polling unit agents, Everything). The national admin downloads directly. Anyone else with export rights sends the same filtered view for approval (Reports and exports). Every row carries the name of the person it was exported for, and each download is audit-logged with its filters, columns and row count. The .xlsx writer is `lib/xlsx.js` and has no dependencies.
- **Groups and Volunteers.** Filterable directories and profiles. A group profile has tabs for overview, members, online presence, activities, gallery, tasks and history, plus a group health score.
- **Activities.** An activity log with voter concerns and incidents. "Report an activity" includes photo, video and link uploads.
- **Media library.** The moderation queue. Items can be approved, cleared for publicity by the media directorate, or rejected with a reason sent to the uploader.
- **Tasks.** Assign work to all groups in an area or to chosen groups, with a target and progress reports.
- **Messages.** SMS, WhatsApp or email to a filtered audience, for opted-in people only. The recipient count and cost show before sending, and more than 10,000 recipients needs a second approver.
- **Map and coverage.** A state or LGA choropleth for volunteers, PVC readiness, PU coverage or groups. Ward and polling-unit gap lists show where there is nobody.
- **Election day.** The agent roster (primary and backup per PU, with accreditation), the situation room (check-ins, results, confirmation against the sheet photo, silent PUs) and incidents. It is off until the national admin switches it on.
- **Field registration.** Offline mode for agents. Records queue on the phone and sync later, and the registrant's phone is confirmed by a code they read out.
- **Reports and exports.** Every export requested by a coordinator needs national admin approval, is watermarked with the requester's name, and is a single download within 24 hours. The national admin's own downloads from the directory skip approval but are watermarked and audit-logged in the same way. All of it is audit-logged.
- **Data requests.** The DPO's queue for deletion requests. Deletion anonymises the record so counts and history stay consistent.
- **Settings.** Users and roles, the audit log, the election-day switch, channel status and a USSD simulator.

## Low-bandwidth channels

- **USSD.** Aggregator webhook at `POST /api/v1/ussd/callback` (Africa's Talking format). Screens are 160 characters or less, and a redial resumes from the last answer. Test it at Workspace → Settings → System → USSD simulator.
- **WhatsApp.** `GET/POST /api/v1/whatsapp/webhook`. It runs the same conversation as USSD. Photos from verified members go to their group's gallery for review.
- **Field agents.** `POST /api/v1/sync/batch`, called by the offline field-registration page.

All three channels end in the same `createVolunteer()` as the website, with the
same validation and duplicate checks (`lib/registration.js`).

## How the rules are enforced

- **Access follows geography.** `lib/scope.js` builds one SQL clause per viewer, and every workspace query and API route goes through it. A ward coordinator who opens a record outside their ward gets a 404, by page, by API or by direct URL. The tests check this.
- **Minimum data.** The site never asks for NIN, BVN, VIN, PVC photos, religion or ethnicity. Phone numbers and emails are AES-256-GCM encrypted at field level, with a keyed hash used for lookups (`lib/crypto.js`), so the database never holds them in clear.
- **Consent.** Recorded per type (accuracy, data use, messaging) with the notice version, channel and time. Nothing is pre-ticked.
- **Audit log.** Covers every view of a full record, verification, export, message campaign, role change and sign-in.
- **Media.** Uploads are resumable and chunked. Photos are compressed on the phone. On the server, re-encoding strips all EXIF data including GPS, and 320px and 960px sizes are made. Duplicates are caught by SHA-256 and a perceptual hash. Everything goes to moderation.

## Tests

```bash
npm test
```

The tests cover the §11 validation rules, Hausa, Yoruba and Igbo names,
duplicate detection, the rule that phone numbers never reach disk in clear,
ward-scoped access, the 160-character limit on every USSD screen in the
country, and a full USSD registration with resume.

## Languages

English, Hausa, Yoruba, Igbo and Nigerian Pidgin. Strings are written in English
in the code and translated in `lib/i18n/translations.tsv`. To update them:

```bash
node scripts/i18n-strings.mjs --missing ha   # what Hausa still lacks
node scripts/i18n-build.mjs                  # regenerate lib/i18n/*.js from the TSV
```

**The translations are drafts.** Native speakers must review every string before
launch (spec §13). Some workspace analytics text is still English-only.

## Database

PostgreSQL everywhere, one schema (`lib/migrations.js`), one data layer (`lib/db.js`):

| Where | Database | How it connects |
|---|---|---|
| Production | Neon (`eu-west-2`, London) | `APP_DATABASE_URL`: the limited `adc_app` account, through Neon's connection pooler |
| Your machine | Embedded Postgres (PGlite) in `data/pglite` | Automatic when no database URL is set |
| Tests | Embedded Postgres, in memory | Automatic |

**Protection, in layers.**

- **No SQL injection.** Every query uses parameters. Values are sent separately from the SQL text, so nothing a person types can change a statement.
- **Least privilege.** The website signs in as `adc_app`. It can read and write rows, but it cannot create, alter or drop tables, cannot change or delete audit entries, and cannot rewrite the migration history. `npm run db:setup` checks each of these and reports it. The owner account is used only by the admin scripts on your machine and is never given to the host.
- **Append-only audit log.** A trigger stops any update, delete or truncate, even from an account that somehow gained the rights.
- **Integrity rules in the database.** Statuses, roles, channels and flags must come from fixed lists. JSON must be valid. Phone numbers are unique. Nobody can approve their own export.
- **Encryption.**
  - Connections are TLS with the server certificate checked in full.
  - Phone numbers and emails are also sealed in the application (AES-256-GCM) before they reach the database (`lib/crypto.js`).
- **Guard rails on every app session.**
  - A query is stopped after 20 s.
  - A lock wait is stopped after 5 s.
  - A transaction left open is closed after 30 s.
  - Every session works in UTC.

**Staying up.**

- **Retries.** Connection failures are retried with backoff: Neon pauses idle databases, and waking one takes a moment. A transaction that lost a race (deadlock or serialisation failure) is retried whole. Counters are a single atomic statement, so two requests never get the same number.
- **Readable failures.** A failing query is logged with its SQL text, never its values, so problems can be traced without personal data in the logs.
- **Health check.** `GET /api/v1/health` returns 200 when the database answers and its schema matches the release, and 503 otherwise. Point an uptime monitor at it.
- **Backups.** Neon keeps point-in-time history, so you can restore the database to any moment in the retention window from the Neon console. Before a risky change, create a branch: it is an instant copy.

**Commands** (run on your own machine; they read `.env.production`):

```bash
npm run db:setup     # apply migrations, create or refresh the adc_app account, write APP_DATABASE_URL
npm run db:migrate   # apply migrations only (run before deploying a release that adds one)
npm run db:clean     # empty the production database and create the first Super Admin
```

Each `db:setup` run gives `adc_app` a new password. After running it, update `APP_DATABASE_URL` on the host.

**Changing the schema.** Add a new entry at the end of `MIGRATIONS` in `lib/migrations.js`. Never edit a released one. Run `npm run db:migrate`, then deploy. A release whose schema is ahead of the database refuses to serve, with a message saying to migrate, rather than failing page by page.

## Deploy to production

The site is a standard Next.js app on Node 22.13 or newer. It runs on Vercel or on any Node host.

1. `npm run db:setup` (once, and after rotating the database password).
2. Set these on the host: `APP_DATABASE_URL`, `APP_SECRET` (the same secret the data was sealed with), `SITE_URL` and `SMS_PROVIDER`. Do **not** set `DATABASE_URL` there: the owner account stays on your machine.
3. Deploy. `vercel.json` places the functions in London (`lhr1`), next to the database, so each query is a short hop.

- **Required:** `APP_SECRET` (the server refuses to start without it), a database URL and `SITE_URL`. See `.env.example` for everything else.
- **Media files:** uploads are still written to the server's disk (`STORAGE_DIR`). On Vercel that disk is temporary, so photos uploaded there disappear when an instance is recycled. Before relying on media in production, move uploads to object storage (Vercel Blob, S3 or Cloudflare R2), or host on a server with a persistent disk.
- **HTTPS:** put the site behind HTTPS. The app sends HSTS and secure cookies in production.
- **Search engines:** `robots.txt` keeps the dashboards, API and personal pages out of search results; `sitemap.xml` lists the public pages.

## Before launch

1. **Brand.** Confirm the logo files and colours with the party secretariat (spec §3.1). The current colours are sampled from the supplied logo.
2. **Secrets.** Set `APP_SECRET`, a long random value. Keep it safe: it encrypts every phone number.
3. **SMS and email.** Choose an SMS aggregator, set `SMS_PROVIDER`, and implement `deliver()` in `lib/notify.js`. Set `SMTP_URL` and `EMAIL_FROM` so approval emails and password resets are actually sent.
4. **USSD and WhatsApp.** Provision the short code and the WhatsApp Business number. Set `USSD_CALLBACK_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_TOKEN`.
5. **Scale.** The database is Postgres with indexes on every filtered column. For national rollout, raise the Neon compute size, put uploads on S3-compatible storage behind a CDN, and add an ffmpeg worker to transcode videos to 720p and 480p.
6. **Retention.** Agree the retention period with legal counsel and schedule the anonymisation job.
7. **Review.** The party's legal team should review compliance with the NDPA 2023, the Electoral Act 2022 and INEC's campaign rules. Register with the NDPC, commission a penetration test, and hold an election-day rehearsal.
8. **Pilot.** Run a pilot in two or three LGAs (urban, semi-urban and rural) before national rollout (spec §21).
