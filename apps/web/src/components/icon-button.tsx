import type * as React from "react"

import * as Button from "@/components/ui/button"
import * as Tooltip from "@/components/ui/tooltip"

type IconButtonProps = Omit<React.ComponentProps<typeof Button.Button>, "size" | "aria-label" | "title"> & {
  /** Names the action. Used as both the accessible name and the tooltip - they must not differ. */
  label: string
}

/**
 * Every icon-only button goes through this. A hand-rolled one ships with a `title` and no
 * `aria-label` - fine for a sighted mouse user, silent to a screen reader.
 */
export const IconButton = (props: IconButtonProps) => {
  // Never a submit: an icon button inside a form steps, clears or closes, it does not send.
  const { label, variant = "ghost", type = "button", children, ...rest } = props

  return (
    <Tooltip.Tooltip>
      <Tooltip.TooltipTrigger asChild>
        <Button.Button variant={variant} type={type} size="icon" aria-label={label} {...rest}>
          {children}
        </Button.Button>
      </Tooltip.TooltipTrigger>
      <Tooltip.TooltipContent>{label}</Tooltip.TooltipContent>
    </Tooltip.Tooltip>
  )
}
