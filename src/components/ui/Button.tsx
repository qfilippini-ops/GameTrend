"use client";

import { motion } from "framer-motion";
import { type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gradient";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-950/60 hover:shadow-neon-sm-brand border border-brand-500/30",
  secondary:
    "bg-surface-800/80 hover:bg-surface-700/80 text-white border border-surface-600/60 hover:border-surface-500",
  ghost:
    "bg-transparent hover:bg-surface-800/50 text-surface-300 hover:text-white border border-surface-700/40 hover:border-surface-600",
  danger:
    "bg-red-700 hover:bg-red-600 text-white shadow-lg shadow-red-950/50 border border-red-600/30",
  gradient:
    "bg-gradient-brand text-white shadow-lg shadow-brand-950/60 glow-brand hover:opacity-90 border-0",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-4 py-2 rounded-xl",
  md: "text-base px-6 py-3 rounded-2xl",
  lg: "text-lg px-8 py-4 rounded-2xl font-bold",
};

export default function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  fullWidth = false,
  type = "button",
  className = "",
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? "w-full" : ""}
        font-semibold transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {children}
    </motion.button>
  );
}
