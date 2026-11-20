# Vercel + Neon + private Cloudflare R2

The app runs on Vercel, relational data stays in Neon, and uploaded files and
unfinished upload chunks are stored in a private R2 bucket. No R2 credential is
sent to browsers. Authorized file requests receive a signed GET link that expires
after 60 seconds. Anyone holding that link can use it until it expires.

## Required configuration

Set these in the Vercel project's environment settings, then redeploy. Keep
preview environments on separate Neon branches and separate R2 buckets.

| Variable | Value |
|---|---|
| `APP_DATABASE_URL` | Neon pooled connection string for the limited `adc_app` role |
| `APP_SECRET` | Existing encryption secret; do not rotate it without a data migration |
| `SITE_URL` | Exact HTTPS origin of this deployment, e.g. `https://your-domain.example` |
| `STORAGE_BACKEND` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 S3 API access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API secret |
| `R2_BUCKET` | Private bucket name |
| `SMTP_URL` | Authenticated SMTP URL for password-reset emails |
| `EMAIL_FROM` | Verified sender address |
| `CRON_SECRET` | Separate random secret of at least 32 characters |
| `OTP_PROVIDER` | `twilio_verify` (recommended) or `sms` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify, when `OTP_PROVIDER=twilio_verify` |
| `SMS_PROVIDER` | Other texts and the code fallback, tried in order: e.g. `africastalking,termii`. `console` shows codes on screen |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | Africa's Talking, when listed in `SMS_PROVIDER` |

Do not put `DATABASE_URL` (owner credentials), demo seeding, or production secrets
in public `NEXT_PUBLIC_*` variables. Do not paste credentials into source control.

Run `npm run check:production` in an environment with these values loaded. From
a trusted local environment file, use:

```sh
node --env-file=.env.production scripts/check-production.mjs
```

## One-time codes (SMS)

Recommended: **Twilio Verify** for codes, with a Nigerian gateway as backup.

1. In the Twilio Console, create a Verify service: friendly name `ADC` (it
   appears in the text), code length 6, expiry 10 minutes. Turn on Fraud Guard,
   and under Verify geo permissions allow only Nigeria.
2. Set `OTP_PROVIDER=twilio_verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
   (or `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`) and `TWILIO_VERIFY_SERVICE_SID`.
   Twilio sends from its own pre-registered senders, so no Nigerian sender ID
   has to be approved, and it checks the code itself.
3. For every other text (approval notices etc.) and as the automatic fallback
   when Twilio Verify is unreachable, set `SMS_PROVIDER` to one or more
   gateways: `africastalking`, `twilio`, `termii`. Each sender ID must be
   registered on the Nigerian **transactional** route, or DND numbers drop it.
4. Run `npm run check:production`, then request a code on MTN, Airtel, Glo
   and 9mobile numbers (one of them on DND) before launch.

With `SMS_PROVIDER=console` and `OTP_PROVIDER=sms`, codes stay visible on screen
even in production. The preflight reports this as a warning: it does not
verify phone ownership.

## R2 setup

1. Create a private R2 bucket. Leave public `r2.dev` access and public custom
   domains disabled. Create a bucket-scoped Object Read & Write API token.
2. Configure CORS for your exact app origin if the browser needs cross-origin
   access to signed media: methods `GET` and `HEAD`, allowed header `Range`,
   exposed headers `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag`.
   Add a separate preview origin only when needed. Uploads go through the app;
   the browser does not receive upload credentials.
3. Add an R2 lifecycle rule deleting objects under `tmp/` after **8 days**.
   This catches orphaned chunks left by crashes. Incomplete upload records are
   retired after 7 days by the maintenance job.
4. If existing media live on a persistent disk, copy them to R2 **with identical
   object keys** before changing `STORAGE_BACKEND`. Existing temporary uploads
   should be completed or discarded first. Changing the setting does not migrate
   old files automatically. Files already lost from ephemeral disks cannot be
   reconstructed by this release.

See [Cloudflare's SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
and [presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## Database and deployment order

1. Take a Neon recovery point/branch before the release and verify your restore
   process. Keep the owner connection string on the administrator's machine.
2. Run `npm ci`, then `npm run db:migrate` from that machine. This adds migration
   `0006_upload_chunks` (chunk manifests, rate limits and durable file-deletion
   queue). It does not erase or seed existing application records. The app role's
   default privileges must have been established by the original setup script.
3. Configure Vercel's environment, then deploy the release. Do not run
   `db:setup` merely to deploy: that command rotates the app database password.
4. Verify `/api/v1/health` returns 200 and the expected schema. The local build
   and unit tests do not prove live credentials, database grants or R2 permissions.

The Vercel cron invokes `/api/v1/maintenance` daily at 03:00 UTC (04:00 Lagos).
`CRON_SECRET` protects it. It removes expired auth/rate-limit records, retires
up to 25 stale uploads and processes up to 100 queued object deletions per run.
Failed object deletions remain queued for retry. Monitor the queue and cron logs;
increase execution frequency/capacity if demand exceeds those bounds.

## Launch smoke test

Use synthetic records in preview first:

- Health returns 200; unauthenticated private pages redirect to sign-in.
- Temporary OTP sign-in works; reusing a code fails.
- Password-reset email arrives; using one link invalidates other outstanding
  reset links and revokes existing sessions.
- Upload a photo and a video, interrupt and resume an upload, then access them
  from another request/session. Verify video seeking and the 60-second signed
  URLs. Unauthenticated requests for private files must fail.
- Remove a photo/account and run maintenance; verify queued files disappear
  and a deleted account's old sessions no longer work.
- Verify cross-origin write requests and unauthenticated cron requests fail.
- Test mobile keyboard navigation and the actual browsers you support.

Production approval still requires live service checks, monitoring, restore
verification and acceptance of the temporary OTP exception. No live credentials
or production data were used by the automated review tests.
