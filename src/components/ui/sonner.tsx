import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"
import { useIsCompactLayout } from "@/hooks/use-mobile"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // Phones and tablets place toasts above the dock (index.css), so the list is anchored at the bottom there.
  // A top-anchored list given a bottom offset stretches across the page and swallows every tap while a toast shows.
  const compact = useIsCompactLayout()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group lg:!right-5 lg:!top-[calc(env(safe-area-inset-top)+5rem)]"
      position={compact ? "bottom-right" : "top-right"}
      offset={20}
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
