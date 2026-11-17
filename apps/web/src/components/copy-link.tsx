import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as IconButton from "@/components/icon-button"

export function CopyLink({ url, className }: { url: string; className?: string }) {
  const { t } = ReactI18next.useTranslation()
  return (
    <IconButton.IconButton
      label={t("copyLink")}
      className={className}
      onClick={() =>
        void navigator.clipboard.writeText(url).then(
          () => Sonner.toast.success(t("linkCopied")),
          () => Sonner.toast.error(t("linkNotCopied"))
        )
      }
    >
      <LucideReact.LinkIcon />
    </IconButton.IconButton>
  )
}
