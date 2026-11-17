import * as ValidateEnv from "@julr/vite-plugin-validate-env"
import tailwindcss from "@tailwindcss/vite"
import * as RouterPlugin from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import TurboConsole from "unplugin-turbo-console/vite"
import * as Vite from "vite"
import * as Url from "node:url"
import checker from "vite-plugin-checker"
import svgr from "vite-plugin-svgr"

/*
 * Tailwind v4 emits @property, color-mix() and cascade layers, and tsconfig's `lib: ES2024` assumes
 * the ES2024 runtime APIs; Vite transpiles syntax but never polyfills, so bump these with `lib`.
 */
const BROWSER_TARGET = ["chrome119", "edge119", "firefox128", "safari17.4"]

/** The API, which serves the console from its own origin in production. */
const api = process.env.DEV_API_TARGET ?? "http://localhost:4200"

/*
 * Same-origin in dev too, so the session cookie and better-auth's origin check behave as in
 * production. `origin` is rewritten to the API's, which is the only origin it trusts. The trailing
 * slash leaves a console page named like a module, such as `/calendar`, to the console.
 */
const proxy = Object.fromEntries(
  ["/auth/", "/global/", "/calendar/", "/work/", "/openapi.json"].map((path) => [
    path,
    { target: api, changeOrigin: true, headers: { origin: api } }
  ])
)

export default Vite.defineConfig({
  // The commit the build came from; the locale URLs carry it so a deploy busts their cache.
  define: {
    __APP_COMMIT__: JSON.stringify(process.env.APP_COMMIT ?? "dev")
  },
  resolve: {
    alias: { "@": Url.fileURLToPath(new URL("./src", import.meta.url)) }
  },
  build: {
    target: BROWSER_TARGET,
    cssTarget: BROWSER_TARGET,
    cssMinify: "lightningcss",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Outranks the rest, or another family claims react on its way past.
            { name: "@react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
            { name: "@tanstack", test: /node_modules[\\/]@tanstack[\\/]/, priority: 10 },
            { name: "@radix", test: /node_modules[\\/](@radix-ui|radix-ui)[\\/]/, priority: 10 },
            { name: "@i18n", test: /node_modules[\\/](i18next|react-i18next)/, priority: 10 },
            { name: "@datepicker", test: /node_modules[\\/](react-day-picker|date-fns)[\\/]/, priority: 10 },
            { name: "@vendor", test: /node_modules/, priority: 0 }
          ]
        }
      }
    }
  },
  plugins: [
    // Must precede react(): it generates routeTree.gen.ts and rewrites route modules.
    RouterPlugin.tanstackRouter({
      target: "react",
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true
    }),
    react(),
    svgr(),
    tailwindcss(),
    checker({ typescript: true, overlay: { initialIsOpen: false } }),
    ValidateEnv.ValidateEnv(),
    TurboConsole()
  ],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    proxy
  }
})
