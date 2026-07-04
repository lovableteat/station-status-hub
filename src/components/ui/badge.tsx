import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-[0.03em] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "border-primary/35 bg-gradient-primary text-primary-foreground hover:brightness-110",
        secondary:
          "border-border/75 bg-secondary/85 text-secondary-foreground hover:bg-secondary",
        destructive:
          "border-destructive/35 bg-destructive/15 text-destructive hover:bg-destructive/20 dark:text-red-100",
        outline:
          "border-border/80 bg-secondary/65 text-foreground/90 hover:bg-accent/80 hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
