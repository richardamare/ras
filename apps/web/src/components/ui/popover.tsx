import * as React from "react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"

function Popover({ ...props }: React.ComponentProps<typeof RadixUi.Popover.Root>) {
  return <RadixUi.Popover.Root data-slot="popover" {...props} />
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof RadixUi.Popover.Anchor>) {
  return <RadixUi.Popover.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof RadixUi.Popover.Content>) {
  return (
    <RadixUi.Popover.Portal>
      <RadixUi.Popover.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={Utils.cn(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </RadixUi.Popover.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent }
