import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group max-sm:!left-2 max-sm:!right-auto"
      position="top-right"
      offset={{
        top: "calc(env(safe-area-inset-top) + 5rem)",
        right: "1.25rem",
      }}
      mobileOffset={{
        top: "max(6px, env(safe-area-inset-top))",
        right: "0.5rem",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast max-sm:!min-h-[52px] max-sm:!w-[min(250px,calc(100vw-7.5rem))] max-sm:!rounded-xl max-sm:!px-3 max-sm:!py-2 group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "max-sm:!line-clamp-2 max-sm:!text-xs group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

// Sonner intentionally exposes its imperative toast helper beside the renderer.
// eslint-disable-next-line react-refresh/only-export-components
export { Toaster, toast }
