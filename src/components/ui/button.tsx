import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[0.01em] ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary/35 bg-gradient-primary text-primary-foreground shadow-[0_14px_30px_-18px_hsl(var(--primary)/0.9)] hover:border-primary/55 hover:brightness-110 hover:shadow-glow",
        destructive:
          "border border-destructive/35 bg-gradient-danger text-destructive-foreground shadow-[0_14px_30px_-18px_hsl(var(--destructive)/0.85)] hover:border-destructive/55 hover:brightness-110",
        outline:
          "border border-border/75 bg-background/65 text-foreground shadow-sm backdrop-blur hover:border-primary/45 hover:bg-primary/10 hover:text-primary",
        secondary:
          "border border-border/60 bg-secondary/80 text-secondary-foreground shadow-sm hover:bg-secondary hover:border-border",
        ghost:
          "text-foreground/85 hover:bg-accent/75 hover:text-accent-foreground",
        link: "rounded-md px-1 text-primary underline-offset-4 hover:text-primary/80 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
