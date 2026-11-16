import * as Utils from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={Utils.cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

export { Skeleton }
