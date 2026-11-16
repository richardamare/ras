import * as React from "react"
import * as ReactRouter from "@tanstack/react-router"
import * as ReactI18next from "react-i18next"

import * as AppHeader from "@/components/app-header"
import * as AppSidebar from "@/components/app-sidebar"
import * as EnvironmentBanner from "@/components/environment-banner"
import * as PageLoader from "@/components/page-loader"
import * as SignIn from "@/components/sign-in"
import * as Sidebar from "@/components/ui/sidebar"
import * as Auth from "@/lib/auth"

/** The console behind the owner's session; without one it shows the sign-in in place, so the URL survives. */
export const AppShell = () => {
  const { t } = ReactI18next.useTranslation("@App")
  const { data: session, isPending } = Auth.authClient.useSession()

  React.useEffect(() => {
    document.title = t("name")
  }, [t])

  if (isPending) return <PageLoader.PageLoader />
  if (session === null) return <SignIn.SignIn />

  return (
    // Every link in the height chain needs `min-h-0`, or the overflow escapes `main` to the window.
    <div className="flex h-svh flex-col">
      <EnvironmentBanner.EnvironmentBanner className="shrink-0" />
      <Sidebar.SidebarProvider className="relative min-h-0 flex-1 overflow-hidden">
        <AppSidebar.AppSidebar />
        <Sidebar.SidebarInset className="min-h-0 min-w-0">
          <AppHeader.AppHeader />
          <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
            <React.Suspense fallback={<PageLoader.PageLoader />}>
              <ReactRouter.Outlet />
            </React.Suspense>
          </main>
        </Sidebar.SidebarInset>
      </Sidebar.SidebarProvider>
    </div>
  )
}
