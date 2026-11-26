import * as OAuth from "../oauth/OAuth.ts"

const provider: OAuth.Provider = {
  name: "google",
  label: "Google",
  signIn: "Google",
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  scope: "openid email https://www.googleapis.com/auth/calendar.events",
  /** Offline access and a fresh consent make Google send a refresh token on every connection, a repeated one too. */
  authorizeParams: { access_type: "offline", prompt: "consent select_account" },
  scopeOnGrant: false,
  clientId: "RAS_GOOGLE_CLIENT_ID",
  clientSecret: "RAS_GOOGLE_CLIENT_SECRET",
  callbackPath: "/google/callback"
}

/** The owner's Google account, whose calendars the Calendar API writes. */
export class Google extends OAuth.Account<Google>()("@ras/global/Google", provider) {}
