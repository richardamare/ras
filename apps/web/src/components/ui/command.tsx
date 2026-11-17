import * as React from "react"
import * as Cmdk from "cmdk"
import * as LucideReact from "lucide-react"

import * as Utils from "@/lib/utils"

function Command({ className, ...props }: React.ComponentProps<typeof Cmdk.Command>) {
  return (
    <Cmdk.Command
      data-slot="command"
      className={Utils.cn(
        "flex size-full flex-col overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof Cmdk.Command.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="m-1 mb-0 flex h-8 items-center gap-2 rounded-md bg-input/30 px-2 text-sm"
    >
      <LucideReact.SearchIcon className="size-4 shrink-0 opacity-50" />
      <Cmdk.Command.Input
        data-slot="command-input"
        className={Utils.cn(
          "w-full bg-transparent outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<typeof Cmdk.Command.List>) {
  return (
    <Cmdk.Command.List
      data-slot="command-list"
      className={Utils.cn("max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none", className)}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof Cmdk.Command.Empty>) {
  return (
    <Cmdk.Command.Empty
      data-slot="command-empty"
      className={Utils.cn("py-6 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof Cmdk.Command.Group>) {
  return (
    <Cmdk.Command.Group
      data-slot="command-group"
      className={Utils.cn("overflow-hidden p-1 text-foreground", className)}
      {...props}
    />
  )
}

function CommandItem({ className, children, ...props }: React.ComponentProps<typeof Cmdk.Command.Item>) {
  return (
    <Cmdk.Command.Item
      data-slot="command-item"
      className={Utils.cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <LucideReact.CheckIcon className="ms-auto opacity-0 group-data-[checked=true]/command-item:opacity-100" />
    </Cmdk.Command.Item>
  )
}

export { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList }
