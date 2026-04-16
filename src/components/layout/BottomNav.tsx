"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isFullUser = !!user && !user.is_anonymous;
  const { unreadCount } = useNotifications(isFullUser ? user.id : null);

  const isGameRoute = pathname.startsWith("/games/");
  if (isGameRoute) return null;

  const navItems = [
    {
      href: "/",
      label: "Accueil",
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      href: "/presets",
      label: "Presets",
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
    },
    {
      href: "/presets/new",
      label: "Créer",
      icon: (_active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
      isCreate: true,
    },
    {
      href: "/friends",
      label: "Amis",
      badge: isFullUser ? unreadCount : 0,
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      href: "/profile",
      label: "Profil",
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 pb-safe">
      <div className="mx-auto max-w-lg px-3 pb-3">
        <div className="glass border border-white/8 rounded-2xl flex items-center justify-around px-2 py-2 shadow-xl shadow-black/40">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            if (item.isCreate) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand glow-brand text-white transition-all hover:opacity-90 active:scale-95"
                >
                  {item.icon(false)}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center gap-1 flex-1 py-2 px-1 rounded-xl transition-colors"
              >
                <span className={`relative transition-all ${isActive ? "text-brand-400" : "text-surface-500"}`}>
                  {item.icon(isActive)}
                  {/* Badge notifications */}
                  {"badge" in item && item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-brand-500 text-white text-[9px] font-bold flex items-center justify-center"
                      style={{ boxShadow: "0 0 6px rgba(68,96,255,0.7)" }}>
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className={`text-xs font-medium transition-colors ${isActive ? "text-brand-400" : "text-surface-500"}`}>
                  {item.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute top-0.5 w-5 h-0.5 rounded-full bg-brand-400"
                    style={{ boxShadow: "0 0 8px rgba(68,96,255,0.9)" }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
