import type { ComponentProps } from "react"
import { createElement } from "react"

export type Nodes = readonly (readonly [
  string,
  Record<string, string | number>,
])[]

/** game-icons.net icons are solid shapes on a 512px grid, Hugeicons are 24px lines. */
export type SolidIcon = { readonly solid: true; readonly nodes: Nodes }
export type IconSvgElement = Nodes | SolidIcon

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
  const solid = "solid" in icon
  const nodes = solid ? icon.nodes : icon

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={solid ? "0 0 512 512" : "0 0 24 24"}
      fill={solid ? "currentColor" : "none"}
      {...props}
    >
      {nodes.map(([tag, { key, ...attrs }], index) =>
        createElement(tag, {
          key: key ?? index,
          ...attrs,
          ...(!solid && "strokeWidth" in attrs ? { strokeWidth } : {}),
        })
      )}
    </svg>
  )
}
