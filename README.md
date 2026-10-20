# ADC Volunteers System

The registration and coordination website for ADC volunteers
(Interface Build Specification v1.0). Volunteers register from
any phone. Every record is tied to INEC's geography down to the polling unit.
Coordinators at every level work from one scoped workspace.

Built with Next.js 16 (App Router), Tailwind 4 and SQLite through Node's built-in
driver. Nothing needs installing beyond Node.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

On first start the site loads **synthetic demo data**: 40 groups, about 1,400
volunteers, activities, media, tasks and an election-day roster in Kubwa ward. No
record belongs to a real person. To start empty, set `SEED_DEMO=0`. To reset the
demo, stop the server and run `npm run seed -- --reset`.

In development, SMS is not sent. One-time codes appear on screen and in the
terminal.

### Demo sign-ins

Every account uses the password `Adc2027!demo`. A code is then shown on screen
as the second factor.

| Role | Phone |
|---|---|
| National admin | 0800 000 0001 |
| Zonal coordinator (North Central) | 0800 000 0002 |
| State coordinator (FCT) | 0800 000 0003 |
| LGA coordinator (Bwari) | 0800 000 0004 |
| Ward coordinator (Kubwa) | 0800 000 0005 |
| Directorate head (Youth) | 0800 000 0006 |
| Data protection officer | 0800 000 0007 |
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

- **Overview.** A to-do list comes first, followed by verified and claimed figures, registrations over 90 days, a coverage map with drill-down, channel mix, role coverage, and a by-area table.
- **Verification.** Groups and volunteers, oldest first, with duplicate warnings and a one-tap Verify, Request info or Reject. Verifying records the method used; rejecting needs a reason.
- **Groups and Volunteers.** Filterable directories and profiles. A group profile has tabs for overview, members, online presence, activities, gallery, tasks and history, plus a group health score.
- **Activities.** An activity log with voter concerns and incidents. "Report an activity" includes photo, video and link uploads.
- **Media library.** The moderation queue. Items can be approved, cleared for publicity by the media directorate, or rejected with a reason sent to the uploader.
- **Tasks.** Assign work to all groups in an area or to chosen groups, with a target and progress reports.
- **Messages.** SMS, WhatsApp or email to a filtered audience, for opted-in people only. The recipient count and cost show before sending, and more than 10,000 recipients needs a second approver.
- **Map and coverage.** A state or LGA choropleth for volunteers, PVC readiness, PU coverage or groups. Ward and polling-unit gap lists show where there is nobody.
- **Election day.** The agent roster (primary and backup per PU, with accreditation), the situation room (check-ins, results, confirmation against the sheet photo, silent PUs) and incidents. It is off until the national admin switches it on.
- **Field registration.** Offline mode for agents. Records queue on the phone and sync later, and the registrant's phone is confirmed by a code they read out.
- **Reports and exports.** Every export needs approval, is watermarked with the requester's name, and is a single download within 24 hours. All of it is audit-logged.
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

## Deploy to production

The site is a standard Next.js app with a SQLite database file. It needs Node 22.13 or newer (it uses Node's built-in `node:sqlite`) and a persistent disk for `data/`.

```bash
npm ci
npm run build
APP_SECRET=… SITE_URL=https://your-domain NODE_ENV=production npm start   # port 3000; set PORT to change
```

- **Required:** `APP_SECRET` (the server refuses to start without it) and `SITE_URL`. See `.env.example` for everything else.
- **Persistent storage:** `data/` holds the database (`adc.db`) and uploads. Mount it on a persistent volume, or set `DATABASE_FILE` and `STORAGE_DIR`, and back it up daily. Serverless hosts without a disk (such as Vercel) are not suitable as-is; use a VPS, Render, Railway or Fly.io with a volume.
- **Demo data:** never loaded in production unless you set `SEED_DEMO=1` (for a staging site only).
- **HTTPS:** put the site behind HTTPS. The app sends HSTS and secure cookies in production.
- **Search engines:** `robots.txt` keeps the dashboards, API and personal pages out of search results; `sitemap.xml` lists the public pages.

## Before launch

1. **Brand.** Confirm the logo files and colours with the party secretariat (spec §3.1). The current colours are sampled from the supplied logo.
2. **Secrets.** Set `APP_SECRET`, a long random value. Keep it safe: it encrypts every phone number.
3. **SMS and email.** Choose an SMS aggregator, set `SMS_PROVIDER`, and implement `deliver()` in `lib/notify.js`. Set `SMTP_URL` and `EMAIL_FROM` so approval emails and password resets are actually sent.
4. **USSD and WhatsApp.** Provision the short code and the WhatsApp Business number. Set `USSD_CALLBACK_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_TOKEN`.
5. **Scale.** SQLite serves a pilot comfortably. For national rollout, move to Postgres (the SQL is portable), put uploads on S3-compatible storage behind a CDN, and add an ffmpeg worker to transcode videos to 720p and 480p.
6. **Retention.** Agree the retention period with legal counsel and schedule the anonymisation job.
7. **Review.** The party's legal team should review compliance with the NDPA 2023, the Electoral Act 2022 and INEC's campaign rules. Register with the NDPC, commission a penetration test, and hold an election-day rehearsal.
8. **Pilot.** Run a pilot in two or three LGAs (urban, semi-urban and rural) before national rollout (spec §21).
