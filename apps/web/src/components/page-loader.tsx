import * as Spinner from "@/components/ui/spinner"
import * as Utils from "@/lib/utils"

type PageLoaderProps = {
  className?: string
  label?: string
}

/**
 * Fills its parent with `flex-1`, not `h-full`, matching how `Empty` centres. `h-full` only
 * resolves where a parent already has a height, so it renders the route-pending state against
 * the top of the window.
 */
export const PageLoader = (props: PageLoaderProps) => {
  const { className, label } = props

  return (
    <div className={Utils.cn("flex min-h-40 w-full flex-1 flex-col items-center justify-center gap-3", className)}>
      <Spinner.Spinner className="size-6 text-primary" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}
