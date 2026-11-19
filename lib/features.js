/**
 * Launch switches.
 *
 * SIGN_IN_OPEN: public sign-in for volunteers. While it is off (the default)
 * the site shows no volunteer "Sign in" links, /login sends people to Join,
 * and the volunteer sign-in API refuses. The coordinator page /signin always
 * works and is linked from the footer ("Campaign coordinator sign in").
 *
 * To bring sign-in back: set NEXT_PUBLIC_SIGN_IN_OPEN=1 on the host and redeploy.
 * (NEXT_PUBLIC_ values are read at build time, so a redeploy is required.)
 */
export const SIGN_IN_OPEN = process.env.NEXT_PUBLIC_SIGN_IN_OPEN === "1";
