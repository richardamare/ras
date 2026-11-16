import * as ReactDevtools from "@tanstack/react-devtools"
import * as ReactQueryDevtools from "@tanstack/react-query-devtools"
import * as ReactRouterDevtools from "@tanstack/react-router-devtools"

import * as Router from "@/router"

// Its own module so main.tsx can lazy() it behind `import.meta.env.DEV`.
export const Devtools = () => (
  <ReactDevtools.TanStackDevtools
    plugins={[
      { name: "TanStack Query", render: <ReactQueryDevtools.ReactQueryDevtoolsPanel /> },
      { name: "TanStack Router", render: <ReactRouterDevtools.TanStackRouterDevtoolsPanel router={Router.router} /> }
    ]}
  />
)
