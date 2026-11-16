import * as Utils from "@/lib/utils"
import * as LucideReact from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LucideReact.Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={Utils.cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
