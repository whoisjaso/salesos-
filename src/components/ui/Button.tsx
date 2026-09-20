import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}

type ButtonAsButton = BaseProps & Omit<ComponentPropsWithoutRef<"button">, keyof BaseProps> & { href?: undefined };
type ButtonAsLink = BaseProps & Omit<ComponentPropsWithoutRef<"a">, keyof BaseProps> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-strong border border-transparent",
  secondary: "bg-raised text-fg border border-line-strong hover:bg-hover",
  ghost: "bg-transparent text-fg-muted border border-transparent hover:bg-hover hover:text-fg",
};

/** sm 32, md 40, lg 44 (phone primary). Icons: 14 with sm, 16 with md and lg. */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-[14px] gap-2",
  lg: "h-11 px-4 text-[15px] gap-2",
};

/**
 * Buttons keep a fixed height and never shift position on hover,
 * so an accidental tap during a live call does not land somewhere else.
 */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", leading, trailing, className, children } = props;
  const classes = cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm font-medium",
    "transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
  const inner = (
    <>
      {leading ? <span className="inline-flex shrink-0" aria-hidden>{leading}</span> : null}
      {children}
      {trailing ? <span className="inline-flex shrink-0" aria-hidden>{trailing}</span> : null}
    </>
  );

  if (props.href !== undefined) {
    const { href, ...rest } = stripOwn(props) as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }
  const { type, ...rest } = stripOwn(props) as ButtonAsButton;
  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {inner}
    </button>
  );
}

const OWN_KEYS: (keyof BaseProps)[] = ["variant", "size", "leading", "trailing", "className", "children"];

function stripOwn<T extends BaseProps>(props: T): Omit<T, keyof BaseProps> {
  const out = { ...props };
  for (const k of OWN_KEYS) delete out[k];
  return out;
}
