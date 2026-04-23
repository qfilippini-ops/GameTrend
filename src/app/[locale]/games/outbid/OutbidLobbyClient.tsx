"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import { Link } from "@/i18n/navigation";
import { OUTBID_META } from "@/games/outbid/config";

export default function OutbidLobbyClient() {
  const t = useTranslations("games.outbid.lobby");

  return (
    <div className="bg-surface-950 bg-grid min-h-screen">
      <Header title={OUTBID_META.name} backHref="/" />

      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-amber-700/20 bg-gradient-to-br from-amber-950/70 via-surface-900 to-brand-950/60 p-5"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(245,158,11,0.12) 0%, transparent 65%)",
            }}
          />
          <div className="relative z-10 flex items-start gap-4">
            <div className="text-5xl shrink-0 animate-float">{OUTBID_META.icon}</div>
            <div className="min-w-0">
              <h1 className="font-display font-black text-white text-2xl leading-tight mb-1">
                {OUTBID_META.name}
              </h1>
              <p className="text-surface-400 text-sm leading-relaxed">
                {OUTBID_META.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {OUTBID_META.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/70 border border-amber-700/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Règles synthétiques */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-5 space-y-3">
          <p className="text-white font-display font-bold text-sm">{t("rulesTitle")}</p>
          <ul className="space-y-2 text-surface-400 text-xs leading-relaxed">
            <li className="flex gap-2">
              <span className="text-amber-400 shrink-0">▸</span>
              <span>{t("rule1")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 shrink-0">▸</span>
              <span>{t("rule2")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 shrink-0">▸</span>
              <span>{t("rule3")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 shrink-0">▸</span>
              <span>{t("rule4")}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 shrink-0">▸</span>
              <span>{t("rule5")}</span>
            </li>
          </ul>
        </div>

        {/* CTA online unique */}
        <Link
          href="/games/outbid/online"
          className="block w-full py-5 rounded-2xl font-display font-bold text-xl text-white text-center transition-all"
          style={{
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            boxShadow: "0 0 28px rgba(245,158,11,0.35)",
          }}
        >
          {t("playOnline")}
        </Link>

        <p className="text-surface-700 text-xs text-center">{t("onlineOnlyHint")}</p>
      </div>
    </div>
  );
}
