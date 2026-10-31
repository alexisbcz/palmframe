import { cn } from "cn"

// Slanted, Higgsfield-style, in the app's amber: the balance and plan badges.
export function CreditsPill({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 -skew-x-[8deg] items-center rounded-[5px] bg-amber-400 px-1.5 py-px text-xs font-extrabold whitespace-nowrap text-amber-950! italic tabular-nums",
        className
      )}
    >
      {children}
    </span>
  )
}
