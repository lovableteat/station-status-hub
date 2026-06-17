import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input/95 bg-secondary/70 px-3 py-2 text-base text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04),0_10px_28px_-24px_hsl(220_50%_2%/0.9)] ring-offset-background backdrop-blur file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground/85 transition-all duration-200 hover:border-primary/35 hover:bg-secondary/90 focus-visible:border-primary/70 focus-visible:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
