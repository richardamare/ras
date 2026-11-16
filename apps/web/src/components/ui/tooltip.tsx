"use client"

import * as React from "react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"

function TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof RadixUi.Tooltip.Provider>) {
  return <RadixUi.Tooltip.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
}

function Tooltip({ ...props }: React.ComponentProps<typeof RadixUi.Tooltip.Root>) {
  return <RadixUi.Tooltip.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof RadixUi.Tooltip.Trigger>) {
  return <RadixUi.Tooltip.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof RadixUi.Tooltip.Content>) {
  return (
    <RadixUi.Tooltip.Portal>
      <RadixUi.Tooltip.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={Utils.cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <RadixUi.Tooltip.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </RadixUi.Tooltip.Content>
    </RadixUi.Tooltip.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
