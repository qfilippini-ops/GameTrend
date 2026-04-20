"use client";

import { Link } from "@/i18n/navigation";
import NotificationBell from "@/components/social/NotificationBell";
import FriendsPanel from "@/components/social/FriendsPanel";

interface HeaderProps {
  title?: string;
  backHref?: string;
  actions?: React.ReactNode;
}

export default function Header({
  title,
  backHref,
  actions,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 glass border-b border-white/5 px-4 py-3 pt-safe">
      <div className="flex items-center gap-3 max-w-lg mx-auto">

        {/* ── Gauche : navigation ── */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {backHref ? (
            <>
              <Link
                href={backHref}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-white hover:border-brand-500/50 transition-all text-sm"
              >
                ←
              </Link>
              {title && (
                <h1 className="text-base font-display font-bold text-white truncate">{title}</h1>
              )}
            </>
          ) : (
            <>
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center text-sm glow-brand">
                  👻
                </div>
                <span className={`font-display font-bold text-white text-lg tracking-tight ${title ? "hidden sm:inline" : ""}`}>
                  Game<span className="text-gradient-brand">Trend</span>
                </span>
              </Link>
              {title && (
                <h1 className="text-base font-display font-bold text-white truncate">{title}</h1>
              )}
            </>
          )}
        </div>

        {/* ── Droite : actions ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          <FriendsPanel />
          <NotificationBell />
          {actions && actions}
        </div>

      </div>
    </header>
  );
}
