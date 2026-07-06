import * as React from "react"

import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  "data-ai-surface"?: boolean | "true" | "false"
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => {
      const isAiSurface = props["data-ai-surface"] === true || props["data-ai-surface"] === "true"

      return (
        <textarea
          className={cn(
            "flex min-h-[96px] w-full appearance-none rounded-2xl border border-input/95 !bg-secondary/82 px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05),0_16px_36px_-30px_hsl(220_50%_2%/0.94)] ring-offset-background backdrop-blur [-webkit-appearance:none] [-webkit-text-fill-color:hsl(var(--foreground))] placeholder:text-muted-foreground/82 transition-all duration-200 hover:border-primary/35 hover:!bg-secondary/92 focus-visible:border-primary/70 focus-visible:!bg-secondary/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          style={
            isAiSurface
              ? style
              : {
                  backgroundColor: "hsl(var(--secondary) / 0.82)",
                  color: "hsl(var(--foreground))",
                  WebkitTextFillColor: "hsl(var(--foreground))",
                  boxShadow:
                    "inset 0 0 0 1000px hsl(var(--secondary) / 0.82), inset 0 1px 0 hsl(0 0% 100% / 0.05), 0 16px 36px -30px hsl(220 50% 2% / 0.94)",
                  ...style,
                }
          }
          ref={ref}
          {...props}
        />
      )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
