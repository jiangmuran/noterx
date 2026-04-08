import * as React from "react";
import { cn } from "../../lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  color?: "default" | "accent" | "success" | "warning";
}

function Progress({ 
  className, 
  value, 
  max = 100, 
  size = "md", 
  showValue = false,
  color = "default",
  ...props 
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const sizes = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };
  
  const colors = {
    default: "bg-[#FF2957]",
    accent: "bg-[#0055FF]",
    success: "bg-[#00D4AA]",
    warning: "bg-[#FFC72C]",
  };

  return (
    <div className={cn("w-full", className)} {...props}>
      <div className={cn("w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700", sizes[size])}>
        <div
          className={cn("h-full transition-all duration-500 ease-out rounded-full", colors[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showValue && (
        <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
}

export { Progress };
