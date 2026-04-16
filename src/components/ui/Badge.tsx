import { type ReactNode } from "react";

type BadgeVariant = "default" | "brand" | "ghost" | "success" | "warning" | "danger";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-surface-800/80 text-surface-300 border border-surface-700/50",
  brand: "bg-brand-950/80 text-brand-300 border border-brand-700/40",
  ghost: "bg-ghost-950/80 text-ghost-300 border border-ghost-700/40",
  success: "bg-emerald-950/80 text-emerald-300 border border-emerald-700/40",
  warning: "bg-amber-950/80 text-amber-300 border border-amber-700/40",
  danger: "bg-red-950/80 text-red-300 border border-red-700/40",
};

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
