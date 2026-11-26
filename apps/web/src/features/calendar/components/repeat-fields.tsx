import * as React from "react"
import * as ReactI18next from "react-i18next"

import * as Button from "@/components/ui/button"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as Select from "@/components/ui/select"
import * as Repeat from "@/features/calendar/lib/repeat"

function Radio({
  name,
  checked,
  onChange,
  children
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: React.ReactNode
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-primary size-4" />
      {children}
    </label>
  )
}

function Custom({
  form,
  set,
  day
}: {
  form: Repeat.RepeatForm
  set: (change: Partial<Repeat.RepeatForm>) => void
  day: string
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const every = form.every === "never" ? "week" : form.every
  return (
    <div className="grid gap-4 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("repeat.interval", { count: form.interval })}</span>
        <Input.Input
          type="number"
          min={1}
          max={99}
          required
          aria-label={t("repeat.interval", { count: form.interval })}
          className="w-20"
          value={form.interval}
          onChange={(event) => set({ interval: event.target.valueAsNumber })}
        />
        <Select.Select value={every} onValueChange={(chosen) => set({ every: chosen as Repeat.Every })}>
          <Select.SelectTrigger aria-label={t("repeat.unitLabel")} className="w-32">
            <Select.SelectValue />
          </Select.SelectTrigger>
          <Select.SelectContent>
            {Repeat.everyChoices.map((choice) => (
              <Select.SelectItem key={choice} value={choice}>
                {t(`repeat.unit.${choice}`, { count: form.interval })}
              </Select.SelectItem>
            ))}
          </Select.SelectContent>
        </Select.Select>
      </div>

      {every === "week" && (
        <fieldset className="grid gap-2">
          <legend className="text-muted-foreground mb-2 text-sm">{t("repeat.on")}</legend>
          <div className="flex flex-wrap gap-1">
            {Repeat.weekdays.map((weekday) => (
              <Button.Button
                key={weekday}
                type="button"
                size="sm"
                className="w-10"
                variant={form.on.includes(weekday) ? "default" : "outline"}
                aria-pressed={form.on.includes(weekday)}
                aria-label={t(`repeat.day.${weekday}`)}
                onClick={() => set({ on: Repeat.toggle(form.on, weekday) })}
              >
                {t(`repeat.short.${weekday}`)}
              </Button.Button>
            ))}
          </div>
        </fieldset>
      )}

      {(every === "month" || every === "year") && (
        <fieldset className="grid">
          <legend className="text-muted-foreground mb-1 text-sm">{t("repeat.when")}</legend>
          {(["date", "weekday"] as const).map((by) => (
            <Radio key={by} name="repeat-by" checked={form.by === by} onChange={() => set({ by })}>
              {every === "month" ? Repeat.monthlyLabel(t, day, by) : Repeat.yearlyLabel(t, day, by)}
            </Radio>
          ))}
        </fieldset>
      )}

      <fieldset className="grid">
        <legend className="text-muted-foreground mb-1 text-sm">{t("repeat.ends")}</legend>
        <Radio name="repeat-end" checked={form.end === "never"} onChange={() => set({ end: "never" })}>
          {t("repeat.end.never")}
        </Radio>
        <Radio name="repeat-end" checked={form.end === "until"} onChange={() => set({ end: "until" })}>
          {t("repeat.end.until")}
          <Input.Input
            type="date"
            required={form.end === "until"}
            disabled={form.end !== "until"}
            min={day}
            aria-label={t("repeat.until")}
            className="w-40"
            value={form.until}
            onChange={(event) => set({ until: event.target.value })}
          />
        </Radio>
        <Radio name="repeat-end" checked={form.end === "count"} onChange={() => set({ end: "count" })}>
          {t("repeat.end.count")}
          <Input.Input
            type="number"
            min={1}
            max={999}
            required={form.end === "count"}
            disabled={form.end !== "count"}
            aria-label={t("repeat.count")}
            className="w-20"
            value={form.count}
            onChange={(event) => set({ count: event.target.valueAsNumber })}
          />
          {t("repeat.occurrences", { count: form.count })}
        </Radio>
      </fieldset>
    </div>
  )
}

/**
 * How often a new event repeats, as Outlook asks it: a quick choice for the start day, or a custom repeat with its
 * interval, weekdays, place in the month and end.
 */
export function RepeatFields({
  form,
  set,
  day
}: {
  form: Repeat.RepeatForm
  set: (change: Partial<Repeat.RepeatForm>) => void
  day: string
}) {
  const { t, i18n } = ReactI18next.useTranslation("Calendar")
  const [preset, setPreset] = React.useState<Repeat.Preset>(() => Repeat.presetOf(form, day))
  const choose = (chosen: Repeat.Preset) => {
    setPreset(chosen)
    set(Repeat.applyPreset(form, chosen, day))
  }
  const shownDay = React.useRef(day)
  React.useEffect(() => {
    if (shownDay.current === day) return
    shownDay.current = day
    const moved = preset === "custom" ? form : Repeat.applyPreset(form, preset, day)
    set(moved.until < day ? { ...moved, until: day } : moved)
  }, [day, form, preset, set])
  const presetLabel = (choice: Repeat.Preset) =>
    choice === "weekly"
      ? t("repeat.preset.weekly", { weekday: t(`repeat.dayOn.${Repeat.weekdayOf(day)}`) })
      : choice === "monthly"
        ? t("repeat.preset.monthly", { where: Repeat.monthlyLabel(t, day, "date") })
        : choice === "yearly"
          ? t("repeat.preset.yearly", { where: Repeat.yearlyLabel(t, day, "date") })
          : t(`repeat.preset.${choice}`)

  return (
    <div className="grid gap-3">
      <Label.Label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">{t("repeat.label")}</span>
        <Select.Select value={preset} onValueChange={(chosen) => choose(chosen as Repeat.Preset)}>
          <Select.SelectTrigger className="w-full">
            <Select.SelectValue />
          </Select.SelectTrigger>
          <Select.SelectContent>
            {Repeat.presets.map((choice) => (
              <Select.SelectItem key={choice} value={choice}>
                {presetLabel(choice)}
              </Select.SelectItem>
            ))}
          </Select.SelectContent>
        </Select.Select>
      </Label.Label>
      {preset === "custom" && <Custom form={form} set={set} day={day} />}
      {form.every !== "never" && (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {Repeat.summaryOf(t, i18n.language, form, day)}
        </p>
      )}
    </div>
  )
}
