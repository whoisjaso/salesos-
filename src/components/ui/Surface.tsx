import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import type { PerformanceState } from "@/domain/types";
import { cn } from "@/lib/cn";

export type SurfacePadding = "none" | "sm" | "md" | "lg";

export interface SurfaceProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Performance outline treatment. Absent means a plain neutral card. */
  state?: PerformanceState;
  padding?: SurfacePadding;
  /** Hover and pressed feedback for clickable cards. */
  interactive?: boolean;
  /** Overlay tier for sheets and menus. */
  tier?: "raised" | "overlay";
  as?: "div" | "section" | "article" | "li" | "button";
  children?: ReactNode;
}

const PAD: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

/** Card container. Neutral by default, performance outline via `state`. */
export function Surface({
  state,
  padding = "md",
  interactive = false,
  tier = "raised",
  as = "div",
  className,
  children,
  ...rest
}: SurfaceProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      data-state={state}
      className={cn(
        "surface relative",
        tier === "overlay" && "bg-overlay",
        PAD[padding],
        interactive &&
          "cursor-pointer text-left transition-[background-color,transform] duration-200 hover:bg-hover active:scale-[0.995] motion-reduce:transition-none",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
