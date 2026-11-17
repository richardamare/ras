import type * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"
import * as NuqsTanstack from "nuqs/adapters/tanstack-router"

import * as AppToaster from "@/components/app-toaster"
import * as ErrorState from "@/components/error-state"

/** Passed to loaders instead of module-level imports, so a route can be given a different one. */
export type RouterContext = {
  queryClient: ReactQuery.QueryClient
}

export const Route = ReactRouter.createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <ErrorState.ErrorState code={404} />,
  errorComponent: ({ error }) => <ErrorState.ErrorState detail={error instanceof Error ? error.message : undefined} />
})

function RootLayout() {
  return (
    <NuqsTanstack.NuqsAdapter>
      <ReactRouter.Outlet />
      <AppToaster.AppToaster />
    </NuqsTanstack.NuqsAdapter>
  )
}
