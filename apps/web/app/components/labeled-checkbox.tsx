import * as React from "react"
import { cn } from "cn"

import { Checkbox } from "@workspace/ui/components/checkbox"

// The kit's checkbox is the box alone. This pairs it with its words, and the
// words toggle it too, the way a label should.
export function LabeledCheckbox({
  isSelected,
  onChange,
  isDisabled,
  className,
  children,
}: {
  isSelected: boolean
  onChange: (next: boolean) => void
  isDisabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <span className={cn("flex items-start gap-2.5 text-sm", className)}>
      <span className="flex h-lh items-center">
        <Checkbox
          aria-labelledby={id}
          isSelected={isSelected}
          onChange={onChange}
          isDisabled={isDisabled}
        />
      </span>
      <span
        id={id}
        className={cn(isDisabled ? "text-muted-foreground" : "cursor-pointer")}
        onClick={() => !isDisabled && onChange(!isSelected)}
      >
        {children}
      </span>
    </span>
  )
}
