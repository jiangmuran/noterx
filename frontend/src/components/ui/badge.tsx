import * as React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "accent" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
    secondary: "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
    outline: "border border-neutral-200 text-neutral-900 dark:border-neutral-700 dark:text-neutral-100",
    accent: "bg-[#FF2957] text-white",
    success: "bg-[#00D4AA] text-white",
    warning: "bg-[#FFC72C] text-neutral-900",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
