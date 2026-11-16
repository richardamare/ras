import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"

function Collapsible({ ...props }: React.ComponentProps<typeof RadixUi.Collapsible.Root>) {
  return <RadixUi.Collapsible.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof RadixUi.Collapsible.CollapsibleTrigger>) {
  return <RadixUi.Collapsible.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof RadixUi.Collapsible.CollapsibleContent>) {
  return (
    <RadixUi.Collapsible.CollapsibleContent
      data-slot="collapsible-content"
      className={Utils.cn(
        "overflow-hidden duration-150 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
