import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full appearance-none rounded-2xl border border-input/95 !bg-secondary/82 px-4 py-2.5 text-base text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05),0_16px_36px_-30px_hsl(220_50%_2%/0.94)] ring-offset-background backdrop-blur [-webkit-appearance:none] [-webkit-text-fill-color:hsl(var(--foreground))] file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground/82 transition-all duration-200 hover:border-primary/35 hover:!bg-secondary/92 focus-visible:border-primary/70 focus-visible:!bg-secondary/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
