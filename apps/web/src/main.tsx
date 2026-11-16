import * as React from "react"
import * as Client from "react-dom/client"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"

import * as ErrorBoundary from "@/components/error-boundary"
import * as PageLoader from "@/components/page-loader"
import * as ThemeProvider from "@/components/theme-provider"
import * as Tooltip from "@/components/ui/tooltip"
import * as Palette from "@/lib/palette"
import * as Router from "@/router"
import "@/lib/i18n"
import "@/app.css"

/*
 * `import.meta.env.DEV`, not `isLocal()`: Vite substitutes it at build time, so a production
 * build drops this branch and the whole devtools import with it. The unified shell has no
 * production no-op the way the two standalone widgets did, so a runtime gate still ships
 * ~72 kB gzip of dev UI to every user.
 *
 * The ternary is load-bearing. Gating the JSX instead and leaving a bare `lazy()` at module
 * scope keeps the chunk: rolldown cannot prove the call is side-effect free, so it stays.
 */
const Devtools = import.meta.env.DEV
  ? React.lazy(() => import("@/components/devtools").then((m) => ({ default: m.Devtools })))
  : () => null

Palette.initPalette()

const root = Client.createRoot(document.getElementById("root") as HTMLElement)

root.render(
  <React.StrictMode>
    <ErrorBoundary.ErrorBoundary>
      <ThemeProvider.ThemeProvider>
        <Tooltip.TooltipProvider delayDuration={300}>
          <ReactQuery.QueryClientProvider client={Router.queryClient}>
            {/*
             * Translations are fetched at runtime from /locales, so the first
             * useTranslation() in any tree suspends. Without a boundary here
             * React logs that suspension as a warning on every cold load.
             */}
            <React.Suspense fallback={<PageLoader.PageLoader />}>
              <ReactRouter.RouterProvider router={Router.router} />
            </React.Suspense>
            <React.Suspense fallback={null}>
              <Devtools />
            </React.Suspense>
          </ReactQuery.QueryClientProvider>
        </Tooltip.TooltipProvider>
      </ThemeProvider.ThemeProvider>
    </ErrorBoundary.ErrorBoundary>
  </React.StrictMode>
)
