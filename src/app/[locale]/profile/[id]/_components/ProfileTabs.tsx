"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import PresetCard from "@/components/presets/PresetCard";
import type { Preset } from "@/types/database";

// Charge le feed lazy (gros composant client) pour ne payer le bundle que
// quand l'utilisateur visualise effectivement l'onglet Activité.
const UserActivityFeed = dynamic(
  () => import("@/components/feed/UserActivityFeed"),
  { ssr: false }
);

interface ProfileTabsProps {
  userId: string;
  presets: Preset[];
  pinnedIds: string[];
}

type Tab = "activity" | "presets";

export default function ProfileTabs({
  userId,
  presets,
  pinnedIds,
}: ProfileTabsProps) {
  const t = useTranslations("profile.public");
  const [tab, setTab] = useState<Tab>("activity");

  const pinnedSet = new Set(pinnedIds);
  const pinned = pinnedIds
    .map((pid) => presets.find((p) => p.id === pid))
    .filter((p): p is Preset => Boolean(p));
  const others = presets.filter((p) => !pinnedSet.has(p.id));

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface-900/60 border border-surface-800/50">
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
            tab === "activity"
              ? "bg-brand-600 text-white shadow"
              : "text-surface-400 hover:text-surface-200"
          }`}
        >
          {t("tabActivity")}
        </button>
        <button
          type="button"
          onClick={() => setTab("presets")}
          className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
            tab === "presets"
              ? "bg-brand-600 text-white shadow"
              : "text-surface-400 hover:text-surface-200"
          }`}
        >
          {t("tabPresets", { count: presets.length })}
        </button>
      </div>

      {tab === "activity" ? (
        <UserActivityFeed userId={userId} />
      ) : (
        <div className="space-y-5">
          {pinned.length > 0 && (
            <section>
              <h2 className="text-surface-400 text-xs uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <span>📌</span>
                {t("pinnedPresets")}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {pinned.map((preset, i) => (
                  <PresetCard key={preset.id} preset={preset} index={i} />
                ))}
              </div>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="text-surface-400 text-xs uppercase tracking-widest mb-3 px-1">
                {t("publicPresets")}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {others.map((preset, i) => (
                  <PresetCard key={preset.id} preset={preset} index={i} />
                ))}
              </div>
            </section>
          )}
          {presets.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 px-5 text-center">
              <div className="text-4xl opacity-50">🎮</div>
              <p className="text-white font-display font-bold text-base">
                {t("noPresetsTitle")}
              </p>
              <p className="text-surface-500 text-sm max-w-xs">
                {t("noPresetsText")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
