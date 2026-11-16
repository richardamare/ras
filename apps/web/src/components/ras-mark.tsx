import type * as React from "react"

/** The ras mark: a lowercase r and a dot, drawn in `currentColor`. */
export const RasMark = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden="true" {...props}>
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="64"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M176 392V248a96 96 0 0 1 96-96h40"
    />
    <circle cx="360" cy="360" r="40" fill="currentColor" />
  </svg>
)
