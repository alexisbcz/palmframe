import type { ComponentProps } from "react"
import { createElement } from "react"

export type Nodes = readonly (readonly [
  string,
  Record<string, string | number>,
])[]

/** Oreo Doodle icons are drawn on a 48px grid, Hugeicons on a 24px one. */
export type DoodleIcon = { readonly doodle: true; readonly nodes: Nodes }
export type IconSvgElement = Nodes | DoodleIcon

type HugeiconsIconProps = Omit<ComponentProps<"svg">, "strokeWidth"> & {
  icon: IconSvgElement
  size?: number | string
  strokeWidth?: number
}

/** Stands in for Hugeicons' component, so call sites stay as they are. */
export function HugeiconsIcon({
  icon,
  size = 24,
  strokeWidth = 2,
  ...props
}: HugeiconsIconProps) {
  const doodle = "doodle" in icon
  const nodes = doodle ? icon.nodes : icon

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={doodle ? "0 0 48 48" : "0 0 24 24"}
      fill="none"
      {...(doodle
        ? {
            stroke: "currentColor",
            // Same drawn weight as a 24px icon at this stroke width.
            strokeWidth: strokeWidth * 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }
        : {})}
      {...props}
    >
      {nodes.map(([tag, { key, ...attrs }], index) =>
        createElement(tag, {
          key: key ?? index,
          ...attrs,
          ...(!doodle && "strokeWidth" in attrs ? { strokeWidth } : {}),
        })
      )}
    </svg>
  )
}
