import * as React from "react"
import * as ReactI18next from "react-i18next"

import * as LoadingButton from "@/components/loading-button"
import * as Alert from "@/components/ui/alert"
import * as Card from "@/components/ui/card"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as Auth from "@/lib/auth"

export const SignIn = () => {
  const { t } = ReactI18next.useTranslation("@Auth")
  const [pending, setPending] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")

  const submit = async () => {
    setPending(true)
    const { error } = await Auth.authClient.signIn.email({ email, password })
    setPending(false)
    setFailed(error !== null)
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card.Card className="w-full max-w-sm">
        <Card.CardHeader>
          <Card.CardTitle>{t("login")}</Card.CardTitle>
        </Card.CardHeader>
        <Card.CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className="grid gap-2">
              <Label.Label htmlFor="email">{t("email")}</Label.Label>
              <Input.Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label.Label htmlFor="password">{t("password")}</Label.Label>
              <Input.Input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {failed && (
              <Alert.Alert variant="destructive">
                <Alert.AlertTitle>{t("loginFailedTitle")}</Alert.AlertTitle>
                <Alert.AlertDescription>{t("loginFailed")}</Alert.AlertDescription>
              </Alert.Alert>
            )}
            <LoadingButton.LoadingButton type="submit" loading={pending}>
              {t("login")}
            </LoadingButton.LoadingButton>
          </form>
        </Card.CardContent>
      </Card.Card>
    </div>
  )
}
