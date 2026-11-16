/**
 * Environment variables imported from env.ts.
 *
 * `strictImportMetaEnv` is Vite's opt-out of the `[key: string]: any` index signature its own
 * ImportMetaEnv carries - without it a typo'd env key silently reads as `any`. With the
 * signature gone, the interface merge below types `import.meta.env`: the validated `VITE_*`
 * keys come from the env.ts schema, the built-ins (DEV, MODE, BASE_URL, ...) stay typed by
 * vite/client. The alias exists because a heritage clause may only name an identifier, not an
 * `import(...)` type.
 */
interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

type ImportMetaEnvAugmented = import("@julr/vite-plugin-validate-env").ImportMetaEnvAugmented<
  typeof import("../../env.ts").default
>

interface ImportMetaEnv extends ImportMetaEnvAugmented {}
