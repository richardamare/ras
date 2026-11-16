import * as Clsx from "clsx"
import * as TailwindMerge from "tailwind-merge"

/** `twMerge` makes `cn('p-2', 'p-4')` yield `p-4`, so a `className` prop can always override. */
export const cn = (...inputs: Clsx.ClassValue[]) => TailwindMerge.twMerge(Clsx.clsx(inputs))
