import * as React from "better-auth/react"

/** better-auth on the API, which serves the console from the same origin. */
export const authClient = React.createAuthClient({ baseURL: `${window.location.origin}/auth` })
