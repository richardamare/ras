import * as React from "react"
import * as LucideReact from "lucide-react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"

function Checkbox({ className, ...props }: React.ComponentProps<typeof RadixUi.Checkbox.Root>) {
  return (
    <RadixUi.Checkbox.Root
      data-slot="checkbox"
      className={Utils.cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      <RadixUi.Checkbox.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <LucideReact.CheckIcon />
      </RadixUi.Checkbox.Indicator>
    </RadixUi.Checkbox.Root>
  )
}

export { Checkbox }
