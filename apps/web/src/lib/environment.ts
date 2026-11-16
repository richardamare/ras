/** The environments the pipeline sets as `VITE_ENVIRONMENT`; `env.ts` accepts exactly these. */
export const environments = ["production", "testing", "local"] as const

export const isLocal = () => import.meta.env.VITE_ENVIRONMENT === "local"
export const isTesting = () => import.meta.env.VITE_ENVIRONMENT === "testing"
export const isProduction = () => import.meta.env.VITE_ENVIRONMENT === "production"
