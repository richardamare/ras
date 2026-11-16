import * as React from "react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<typeof RadixUi.Label.Root>) {
  return (
    <RadixUi.Label.Root
      data-slot="label"
      className={Utils.cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
