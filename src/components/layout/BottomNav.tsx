"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";

export default function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user } = useAuth();
  const isFullUser = !!user && !user.is_anonymous;
  const { unreadCount } = useNotifications(isFullUser ? user.id : null);

  const isGameRoute = pathname.startsWith("/games/");
  if (isGameRoute) return null;

  const navItems = [
    {
      href: "/",
      label: t("feed"),
      badge: isFullUser ? unreadCount : 0,
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <line x1="7" y1="9" x2="17" y2="9" />
          <line x1="7" y1="13" x2="17" y2="13" />
          <line x1="7" y1="17" x2="13" y2="17" />
        </svg>
      ),
    },
    {
      href: "/home",
      label: t("play"),
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      href: "/presets",
      label: t("presets"),
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
    },
    {
      href: "/presets/new",
      label: t("create"),
      icon: (_active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
      isCreate: true,
    },
    {
      href: "/profile",
      label: t("profile"),
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
      <div className="mx-auto max-w-md px-3 pb-3">
        <div className="glass border border-white/8 rounded-2xl flex items-stretch px-1.5 py-2 shadow-xl shadow-black/40">
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
                  className="flex-1 flex items-center justify-center px-1"
                  aria-label={t("createAria")}
                >
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-brand glow-brand text-white transition-all hover:opacity-90 active:scale-95">
                    {item.icon(false)}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center gap-1 flex-1 py-1 px-0.5 rounded-xl transition-colors"
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
                <span className={`text-[11px] font-medium transition-colors ${isActive ? "text-brand-400" : "text-surface-500"}`}>
                  {item.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute top-0 w-5 h-0.5 rounded-full bg-brand-400"
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
