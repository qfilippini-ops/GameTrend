import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  neon?: "brand" | "ghost" | "none";
  onClick?: () => void;
  hover?: boolean;
}

export default function Card({
  children,
  className = "",
  glass = false,
  neon = "none",
  onClick,
  hover = false,
}: CardProps) {
  const base = "rounded-2xl border overflow-hidden transition-all duration-200";

  const bgClass = glass
    ? "glass border-white/8"
    : "bg-surface-900/80 border-surface-700/40";

  const neonClass =
    neon === "brand"
      ? "border-brand-500/40 shadow-neon-sm-brand"
      : neon === "ghost"
      ? "border-ghost-500/40 shadow-neon-sm-ghost"
      : "";

  const hoverClass =
    hover || onClick
      ? "hover:border-brand-500/40 hover:bg-surface-800/80 cursor-pointer hover:shadow-neon-sm-brand"
      : "";

  return (
    <div
      className={`${base} ${bgClass} ${neonClass} ${hoverClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
