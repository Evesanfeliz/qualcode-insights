import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { direction?: "horizontal" | "vertical" }) => (
  <div
    className={cn(
      "flex h-full w-full",
      direction === "vertical" ? "flex-col" : "flex-row",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

const ResizablePanel = ({
  className,
  defaultSize,
  minSize,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { defaultSize?: number; minSize?: number }) => (
  <div
    className={cn("overflow-auto", className)}
    style={{ flex: `${defaultSize ?? 50} 1 0%`, minWidth: minSize ? `${minSize}%` : undefined }}
    {...props}
  >
    {children}
  </div>
);

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { withHandle?: boolean }) => (
  <div
    className={cn(
      "w-1 shrink-0 bg-border hover:bg-accent/30 transition-colors cursor-col-resize",
      className
    )}
    {...props}
  />
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
