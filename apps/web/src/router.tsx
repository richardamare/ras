import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"

import * as ErrorState from "@/components/error-state"
import * as PageLoader from "@/components/page-loader"
import * as RouteTreeGen from "@/routeTree.gen"

export const queryClient = new ReactQuery.QueryClient({
  defaultOptions: {
    queries: {
      /*
       * Every request carries a bearer token that MSAL may have to refresh, so a retry storm
       * is also a token-request storm. One retry is enough to ride out a dropped connection
       * without hammering Entra.
       */
      retry: 1,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false
    }
  }
})

export const router = ReactRouter.createRouter({
  routeTree: RouteTreeGen.routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPendingComponent: PageLoader.PageLoader,
  defaultErrorComponent: ({ error }) => (
    <ErrorState.ErrorState detail={error instanceof Error ? error.message : undefined} />
  ),
  defaultNotFoundComponent: () => <ErrorState.ErrorState code={404} />,
  scrollRestoration: true
})

/** Without this augmentation every path is `string` and a dead link only shows up at runtime. */
declare module "@tanstack/react-router" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
  interface Register {
    router: typeof router
  }
}
