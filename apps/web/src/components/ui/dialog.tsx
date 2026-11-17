import * as React from "react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"
import * as Button from "@/components/ui/button"
import * as LucideReact from "lucide-react"

function Dialog({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Root>) {
  return <RadixUi.Dialog.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Trigger>) {
  return <RadixUi.Dialog.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Portal>) {
  return <RadixUi.Dialog.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof RadixUi.Dialog.Close>) {
  return <RadixUi.Dialog.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof RadixUi.Dialog.Overlay>) {
  return (
    <RadixUi.Dialog.Overlay
      data-slot="dialog-overlay"
      className={Utils.cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof RadixUi.Dialog.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <RadixUi.Dialog.Content
        data-slot="dialog-content"
        className={Utils.cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-xl bg-popover py-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <RadixUi.Dialog.Close data-slot="dialog-close" asChild>
            <Button.Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <LucideReact.XIcon />
              <span className="sr-only">Close</span>
            </Button.Button>
          </RadixUi.Dialog.Close>
        )}
      </RadixUi.Dialog.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={Utils.cn("flex shrink-0 flex-col gap-2 px-4", className)} {...props} />
  )
}

/**
 * The only part of a dialog that scrolls. The header and the footer stay put, and the bar rides the
 * dialog's own edge — the padding is in here rather than on the content, so the scroller spans the
 * full width instead of stopping short of the frame. The vertical padding keeps a focus ring on the
 * first or last field inside the scroller's clip.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={Utils.cn("min-h-0 flex-1 overflow-y-auto px-4 py-1", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={Utils.cn(
        "-mb-4 flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <RadixUi.Dialog.Close asChild>
          <Button.Button variant="outline">Close</Button.Button>
        </RadixUi.Dialog.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof RadixUi.Dialog.Title>) {
  return (
    <RadixUi.Dialog.Title
      data-slot="dialog-title"
      className={Utils.cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof RadixUi.Dialog.Description>) {
  return (
    <RadixUi.Dialog.Description
      data-slot="dialog-description"
      className={Utils.cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
}
