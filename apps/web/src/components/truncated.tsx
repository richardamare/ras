import * as React from "react"

import * as Tooltip from "@/components/ui/tooltip"
import * as Utils from "@/lib/utils"

/** One line of text, cut off with an ellipsis; hovering or focusing it shows the whole text only when it is cut. */
export function Truncated({ text, className }: { text: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [open, setOpen] = React.useState(false)
  const cut = () => ref.current !== null && ref.current.scrollWidth > ref.current.clientWidth

  return (
    <Tooltip.Tooltip open={open} onOpenChange={(next) => setOpen(next && cut())}>
      <Tooltip.TooltipTrigger asChild>
        <span ref={ref} className={Utils.cn("block min-w-0 truncate", className)}>
          {text}
        </span>
      </Tooltip.TooltipTrigger>
      <Tooltip.TooltipContent className="wrap-anywhere">{text}</Tooltip.TooltipContent>
    </Tooltip.Tooltip>
  )
}
