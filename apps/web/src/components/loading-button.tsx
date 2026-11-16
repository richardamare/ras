import type * as React from "react"

import * as Button from "@/components/ui/button"
import * as Spinner from "@/components/ui/spinner"

type LoadingButtonProps = React.ComponentProps<typeof Button.Button> & {
  loading?: boolean
}

export const LoadingButton = (props: LoadingButtonProps) => {
  const { loading = false, disabled, children, ...rest } = props

  return (
    <Button.Button disabled={disabled === true || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner.Spinner /> : null}
      {children}
    </Button.Button>
  )
}
