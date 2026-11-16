"use client"

import * as React from "react"
import * as RadixUi from "radix-ui"

import * as Utils from "@/lib/utils"
import * as LucideReact from "lucide-react"

function DropdownMenu({ ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.Root>) {
  return <RadixUi.DropdownMenu.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.Portal>) {
  return <RadixUi.DropdownMenu.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.Trigger>) {
  return <RadixUi.DropdownMenu.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof RadixUi.DropdownMenu.Content>) {
  return (
    <RadixUi.DropdownMenu.Portal>
      <RadixUi.DropdownMenu.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={Utils.cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </RadixUi.DropdownMenu.Portal>
  )
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.Group>) {
  return <RadixUi.DropdownMenu.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RadixUi.DropdownMenu.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <RadixUi.DropdownMenu.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={Utils.cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof RadixUi.DropdownMenu.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <RadixUi.DropdownMenu.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={Utils.cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <RadixUi.DropdownMenu.ItemIndicator>
          <LucideReact.CheckIcon />
        </RadixUi.DropdownMenu.ItemIndicator>
      </span>
      {children}
    </RadixUi.DropdownMenu.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.RadioGroup>) {
  return <RadixUi.DropdownMenu.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof RadixUi.DropdownMenu.RadioItem> & {
  inset?: boolean
}) {
  return (
    <RadixUi.DropdownMenu.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={Utils.cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <RadixUi.DropdownMenu.ItemIndicator>
          <LucideReact.CheckIcon />
        </RadixUi.DropdownMenu.ItemIndicator>
      </span>
      {children}
    </RadixUi.DropdownMenu.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof RadixUi.DropdownMenu.Label> & {
  inset?: boolean
}) {
  return (
    <RadixUi.DropdownMenu.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={Utils.cn("px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.Separator>) {
  return (
    <RadixUi.DropdownMenu.Separator
      data-slot="dropdown-menu-separator"
      className={Utils.cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={Utils.cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.Sub>) {
  return <RadixUi.DropdownMenu.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof RadixUi.DropdownMenu.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <RadixUi.DropdownMenu.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={Utils.cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <LucideReact.ChevronRightIcon className="ml-auto" />
    </RadixUi.DropdownMenu.SubTrigger>
  )
}

function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof RadixUi.DropdownMenu.SubContent>) {
  return (
    <RadixUi.DropdownMenu.SubContent
      data-slot="dropdown-menu-sub-content"
      className={Utils.cn(
        "z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
}
