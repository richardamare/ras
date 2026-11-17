import * as React from "react"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as Command from "@/components/ui/command"
import * as Popover from "@/components/ui/popover"
import * as Utils from "@/lib/utils"

export type Option = { readonly value: string; readonly label: string }

/** An option stays when its label holds what was typed; its value is an id and never matches. */
export const filter = (_value: string, search: string, keywords?: ReadonlyArray<string>) =>
  keywords?.some((label) => label.toLowerCase().includes(search.trim().toLowerCase())) === true ? 1 : 0

/** A select whose options are narrowed by typing their label. */
export function Combobox({
  label,
  value,
  onChange,
  options,
  className
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<Option>
  className?: string
}) {
  const { t } = ReactI18next.useTranslation()
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <Popover.Popover open={open} onOpenChange={setOpen}>
      <Popover.PopoverTrigger
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        className={Utils.cn(
          "flex h-8 w-fit max-w-64 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <LucideReact.ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </Popover.PopoverTrigger>
      <Popover.PopoverContent align="start" className="w-auto max-w-sm min-w-(--radix-popover-trigger-width) p-0">
        <Command.Command filter={filter}>
          <Command.CommandInput placeholder={t("search")} />
          <Command.CommandList>
            <Command.CommandEmpty>{t("noResults")}</Command.CommandEmpty>
            <Command.CommandGroup>
              {options.map((option) => (
                <Command.CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  data-checked={option.value === value}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="truncate">{option.label}</span>
                </Command.CommandItem>
              ))}
            </Command.CommandGroup>
          </Command.CommandList>
        </Command.Command>
      </Popover.PopoverContent>
    </Popover.Popover>
  )
}
