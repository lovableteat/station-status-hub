import type { ComponentType } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceEntranceItem {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

interface WorkspaceEntranceProps {
  items: WorkspaceEntranceItem[];
  onSelect: (id: string) => void;
}

export function WorkspaceEntrance({
  items,
  onSelect,
}: WorkspaceEntranceProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-92px)] w-full max-w-6xl items-center px-4 py-10 sm:px-6">
      <div className="w-full space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary/75">
            Workspace Navigation
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            選擇要進入的工作區
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            登入後只保留主要入口，不放概覽。點選工作區後再進入對應功能。
          </p>
        </div>

        <div
          className={cn(
            "grid gap-4",
            items.length === 1
              ? "max-w-md mx-auto"
              : items.length === 2
                ? "mx-auto max-w-4xl md:grid-cols-2"
                : "lg:grid-cols-3"
          )}
        >
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="group flex h-full flex-col justify-between rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(224_25%_16%),hsl(225_22%_12%))] p-6 text-left shadow-[0_24px_60px_-42px_hsl(var(--primary)/0.75)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:bg-[linear-gradient(180deg,hsl(223_30%_18%),hsl(225_24%_13%))]"
              >
                <div className="space-y-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                      {item.title}
                    </h2>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="pt-8">
                  <Button
                    variant="ghost"
                    className="h-11 rounded-xl px-0 text-sm font-medium text-primary hover:bg-transparent hover:text-primary"
                  >
                    進入工作區
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Button>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
