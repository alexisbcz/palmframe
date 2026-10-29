import { cn } from "cn"

function Canvas({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="canvas" className={cn(className)} {...props} />
}

export { Canvas }
