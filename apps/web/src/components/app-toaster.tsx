import * as Sonner from "@/components/ui/sonner"

/**
 * Sonner injects its stylesheet unlayered, so it outranks every Tailwind utility — hence the `!` on
 * anything it also sets. A type shows in the icon alone; the toast itself is the same surface as a popover.
 */
export const AppToaster = () => (
  <Sonner.Toaster
    closeButton
    // `toaster` is Sonner's own hook class, not a Tailwind utility, and Sonner is not a shadcn primitive.
    // oxlint-disable-next-line shadcn/no-unknown-classes, shadcn/no-restyle
    className="toaster group font-sans!"
    toastOptions={{
      classNames: {
        toast: "cn-toast items-start! gap-3! p-4! text-sm! shadow-lg!",
        title: "font-medium! leading-snug!",
        description: "text-muted-foreground!",
        icon: "m-0! mt-px! size-4! shrink-0!",
        closeButton:
          "static! order-last! ml-auto! size-5! shrink-0! transform-none! rounded-sm! border-0! bg-transparent! text-muted-foreground! hover:bg-muted! hover:text-foreground!",
        success: "[&_[data-icon]]:text-success",
        error: "[&_[data-icon]]:text-destructive",
        warning: "[&_[data-icon]]:text-warning",
        info: "[&_[data-icon]]:text-primary"
      }
    }}
  />
)
