import type { ComponentType, ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export interface MobileToolsItem {
  key: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect?: () => void;
  /** Count, status text or any small trailing node. */
  trailing?: ReactNode;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  /** Keep the sheet open after selecting (toggles, sort choices). */
  keepOpen?: boolean;
  active?: boolean;
  testId?: string;
}

export interface MobileToolsSection {
  key: string;
  title?: string;
  items?: MobileToolsItem[];
  /** Arbitrary controls (selects, segmented switches) rendered inside the section. */
  content?: ReactNode;
}

export interface MobileToolsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  sections: MobileToolsSection[];
  footer?: ReactNode;
  testId?: string;
}

/**
 * Bottom sheet for everything that is not a primary action on a phone:
 * secondary actions, sort, view settings, exports and help. One sheet per
 * workspace, opened from MobileCommandBar's tools button.
 */
export function MobileToolsSheet({ open, onOpenChange, title, description, sections, footer, testId }: MobileToolsSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent data-mobile-tools-sheet="true" data-testid={testId} className="mobile-tools-sheet lg:hidden">
        <DrawerHeader className="mobile-tools-sheet__header">
          <DrawerTitle className="mobile-tools-sheet__title">{title}</DrawerTitle>
          {description ? <DrawerDescription className="mobile-tools-sheet__description">{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
          <DrawerClose asChild>
            <button type="button" aria-label={`關閉${title}`} data-ui="dialog-close" className="mobile-tools-sheet__close"><X className="h-5 w-5" /></button>
          </DrawerClose>
        </DrawerHeader>
        <div className="mobile-tools-sheet__body">
          {sections.map((section) => (
            <section key={section.key} className="mobile-tools-sheet__section" aria-label={section.title}>
              {section.title && <h3 className="mobile-tools-sheet__section-title">{section.title}</h3>}
              {section.items && section.items.length > 0 && (
                <div className="mobile-tools-sheet__list" role="group">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                        aria-current={item.active ? "true" : undefined}
                        data-mobile-tools-item={item.key}
                        data-testid={item.testId}
                        onClick={() => { item.onSelect?.(); if (!item.keepOpen) onOpenChange(false); }}
                        className={cn("mobile-tools-sheet__item", item.tone === "primary" && "mobile-tools-sheet__item--primary", item.tone === "danger" && "mobile-tools-sheet__item--danger", item.active && "mobile-tools-sheet__item--active")}
                      >
                        {Icon && <span className="mobile-tools-sheet__item-icon" aria-hidden="true"><Icon className="h-4 w-4" /></span>}
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold">{item.label}</span>
                          {item.description && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.description}</span>}
                        </span>
                        {item.trailing !== undefined ? <span className="mobile-tools-sheet__trailing">{item.trailing}</span> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {section.content && <div className="mobile-tools-sheet__content">{section.content}</div>}
            </section>
          ))}
          {footer && <div className="mobile-tools-sheet__footer">{footer}</div>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
