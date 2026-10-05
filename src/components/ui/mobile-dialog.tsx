import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

const MobileDialog = DialogPrimitive.Root

const MobileDialogTrigger = DialogPrimitive.Trigger

const MobileDialogPortal = DialogPrimitive.Portal

const MobileDialogClose = DialogPrimitive.Close

const MobileDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    data-ui="scrim"
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
MobileDialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const MobileDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <MobileDialogPortal>
      <MobileDialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-ui={isMobile ? "mobile-sheet" : "dialog"}
        className={cn(
          "workspace-dialog-surface panel-surface-floating fixed z-50 grid w-full gap-4 text-foreground duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          // Mobile: Full screen bottom sheet
          isMobile ? [
            "bottom-0 left-0 right-0 top-auto rounded-t-[1.5rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5",
            "max-h-[min(88dvh,760px)] overflow-y-auto overscroll-contain",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          ] : [
            // Desktop: Centered dialog  
            "left-[50%] top-[50%] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-y-auto overscroll-contain rounded-[1.5rem] p-6",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          ],
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close data-ui="dialog-close" className={cn(
          "absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        )}>
          <X className={isMobile ? "h-6 w-6" : "h-4 w-4"} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </MobileDialogPortal>
  )
})
MobileDialogContent.displayName = DialogPrimitive.Content.displayName

const MobileDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile()
  
  return (
    <div
      className={cn(
        "app-dialog-header flex flex-col gap-2 text-left",
        isMobile && "pb-4 border-b border-border",
        className
      )}
      {...props}
    />
  )
}
MobileDialogHeader.displayName = "MobileDialogHeader"

const MobileDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile()
  
  return (
      <div className={cn(
        "app-dialog-footer flex gap-3",
        isMobile ? "flex-col mt-6" : "flex-col-reverse sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}
MobileDialogFooter.displayName = "MobileDialogFooter"

const MobileDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-semibold leading-none tracking-tight",
        isMobile ? "text-xl" : "text-lg",
        className
      )}
      {...props}
    />
  )
})
MobileDialogTitle.displayName = DialogPrimitive.Title.displayName

const MobileDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
MobileDialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  MobileDialog,
  MobileDialogPortal,
  MobileDialogOverlay,
  MobileDialogClose,
  MobileDialogTrigger,
  MobileDialogContent,
  MobileDialogHeader,
  MobileDialogFooter,
  MobileDialogTitle,
  MobileDialogDescription,
}
