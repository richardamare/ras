import * as ReactRouter from "@tanstack/react-router"
import * as ReactI18next from "react-i18next"

import * as Auth from "@/lib/auth"

export const Route = ReactRouter.createFileRoute("/_shell/")({
  component: HomePage
})

function HomePage() {
  const { t } = ReactI18next.useTranslation("Home")
  const { data: session } = Auth.authClient.useSession()

  return (
    <section className="grid gap-2">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("signedInAs", { email: session?.user.email ?? "" })}</p>
    </section>
  )
}
