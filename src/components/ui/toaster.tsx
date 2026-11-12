import { useToast } from "@/hooks/use-toast"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon = variant === "success" ? CircleCheck : variant === "warning" ? TriangleAlert : variant === "destructive" ? CircleAlert : Info
        return (
          <Toast key={id} variant={variant} {...props}>
            <Icon className="platform-toast-icon" aria-hidden="true" />
            <div className="grid min-w-0 flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
