"use client"

import * as React from "react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"
import * as Button from "@/components/ui/button"
import * as LucideReact from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Root>) {
  return <RadixUi.Dialog.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Trigger>) {
  return <RadixUi.Dialog.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Close>) {
  return <RadixUi.Dialog.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Portal>) {
  return <RadixUi.Dialog.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof RadixUi.Dialog.Overlay>) {
  return (
    <RadixUi.Dialog.Overlay
      data-slot="sheet-overlay"
      className={Utils.cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof RadixUi.Dialog.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <RadixUi.Dialog.Content
        data-slot="sheet-content"
        data-side={side}
        className={Utils.cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <RadixUi.Dialog.Close data-slot="sheet-close" asChild>
            <Button.Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <LucideReact.XIcon />
              <span className="sr-only">Close</span>
            </Button.Button>
          </RadixUi.Dialog.Close>
        )}
      </RadixUi.Dialog.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={Utils.cn("flex flex-col gap-0.5 p-4", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={Utils.cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof RadixUi.Dialog.Title>) {
  return (
    <RadixUi.Dialog.Title
      data-slot="sheet-title"
      className={Utils.cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof RadixUi.Dialog.Description>) {
  return (
    <RadixUi.Dialog.Description
      data-slot="sheet-description"
      className={Utils.cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
