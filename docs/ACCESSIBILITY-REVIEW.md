# Accessibility and visual review — 18 November 2026

This review covers general accessibility and interface reliability. It is not WCAG certification or a production release sign-off.

## Verified changes

- Public navigation and the workspace drawer trap keyboard focus, make background content inert, close with Escape, and restore focus. Skip links now target focusable main content.
- Shared form controls associate labels, hints and errors; invalid steps focus the first invalid control; step changes focus their heading. Radio groups support arrow keys, Home and End. Step scrolling respects reduced-motion preferences.
- Search uses a named listbox with correctly structured options, removes suggestions from the Tab order, and restores mobile-trigger focus on Escape. Account/notification disclosures restore focus on Escape without claiming unsupported menu semantics.
- Notification badge, sidebar heading, avatar, form placeholder and input-border contrast improved. Hidden radio inputs expose visible keyboard focus.
- Filter links use aria-current instead of button-only aria-pressed. The map legend has a valid group role. Uploaded media videos have accessible names.
- Audit-log tables are keyboard-scrollable, named, and retain readable column widths. Sort controls wrap at narrow widths. Hidden table labels stay within scroll containers. Section tabs no longer create a stray vertical scrollbar.

## Evidence

The review used an isolated copy with a synthetic local PGlite database, never the configured Neon database. No real user records, roles, messages or exports were changed. Audit-only tooling and the instrumentation override are excluded from the applied changes.

46 axe-core scans were recorded across 22 distinct routes. The final recorded scan for each route had zero automated violations. This includes several states and widths, not every combination of page, permission, language and viewport. Some contrast checks remained “incomplete” because of gradients, overlap or clipping; zero automated violations does not resolve those checks automatically.

Routes: `/`, `/help`, `/privacy`, `/status`, `/login`, `/signin`, `/reset`, `/volunteer`, `/workspace`, and workspace `/privacy`, `/settings`, `/team`, `/volunteers`, `/verify`, `/activities`, `/media`, `/tasks`, `/messages`, `/training`, `/exports`, `/election`, `/map`.

Responsive checks used 320, 390/433, 768 and 1280 CSS-pixel widths (earlier homepage inspection also used 1600). The ten-page workspace mobile matrix had no page-level horizontal overflow after fixes. Wide tables intentionally scroll inside their containers.

Manual keyboard checks covered public/workspace navigation trapping and dismissal, search dismissal, account disclosure focus restoration, native download-dialog opening/Escape/return focus, invalid form focus and next-step heading focus. The download dialog also passed its own automated scan. Its download action was not submitted.

Validation: existing 67 regression tests passed; an additional radio-keyboard regression test passed; `npm run build -- --webpack` passed after audit-only UI/instrumentation were removed.

Raw evidence is retained in the local review workspace: `audit/browser-scans.json` and `audit/settings-desktop.jpg`.

## Coverage of the 13 requested review areas

| Area | Completed evidence | Remaining verification |
| --- | --- | --- |
| Responsive layouts | Desktop/tablet/mobile samples and 320px workspace matrix; overflow fixes | Physical phones, landscape, all nested detail/create pages |
| Visual consistency | Shared controls, header, sidebar, tables and public layouts inspected | Every role/language combination and real content lengths |
| Contrast | Automated failures corrected; input borders/placeholders strengthened | Full manual gradient, chart and non-text contrast audit |
| Keyboard | Navigation drawers, search, disclosures, dialog, form errors and steps | Every widget and complete end-to-end workflow |
| Screen-reader semantics | Axe and browser accessibility-tree checks; labels/roles corrected | VoiceOver and NVDA sessions with spoken output |
| Forms | Error associations/focus, step focus and radio-key test | Every conditional branch, retry/offline state and translated error |
| Menus/dialogs | Drawer trapping/inert background; native dialog and disclosure dismissal | Every secondary modal/popover and screen-reader announcement |
| Charts/tables | Existing chart alternatives inspected; audit table scrolling fixed | All chart keyboard/touch interactions and spoken table navigation |
| Loading/empty/error states | Empty privacy queue and form validation observed | Throttled network, server errors, timeout and interrupted upload matrix |
| Zoom/touch | 320px reflow and native-size controls checked | Actual 200%/400% browser zoom and physical touch; attempted shortcut did not verify zoom |
| Motion/media | Reduced-motion CSS inspected and JS step scroll corrected; video naming | OS reduced-motion runtime check; captions, transcripts and audio descriptions for actual content |
| Browser compatibility | Chrome desktop with responsive viewport overrides | Safari, Firefox, iOS Safari and Android Chrome |
| Automated/manual regression | 46 scans, keyboard checks, 68 tests across two runs, production build | Repeat after remaining fixes and before release |

## Known follow-up work

Uploaded training video markup currently has no caption track. Captions/transcripts require reviewed media content and a supported authoring/storage workflow; accessible names alone do not solve this.

The shared asynchronous select currently collapses failed option loading into an empty list. Provide an explicit failure/retry state and test offline recovery. Also exercise validation-server errors and failed submissions before release.

The chart code still needs a dedicated interaction pass: line-chart touch behavior and arrow-key page scrolling, and map focus visibility against every fill. Do not treat chart accessibility as signed off based on axe results.

The public help/footer contains placeholder support contact/USSD information. Replace it with verified operational details before launch.

## Production status

This pass does not verify live Vercel, Neon or Cloudflare R2 configuration, migration execution, backup restoration, SMTP delivery, retention/cron execution or real upload/download behavior. Follow `docs/DEPLOYMENT.md` and complete live staging verification before release. The temporary on-screen OTP behavior remains as requested until the SMS API is implemented; this review does not certify it as production authentication assurance.
