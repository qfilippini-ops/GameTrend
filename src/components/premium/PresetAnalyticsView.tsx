"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Link } from "@/i18n/navigation";

interface AnalyticsData {
  range_days: number;
  total_views: number;
  total_saves: number;
  total_shares: number;
  total_follows: number;
  conversion_rate: number;
  series: Array<{ day: string; views: number; saves: number }>;
  top_countries: Array<{ country: string; count: number }>;
}

const RANGES: { value: 7 | 30 | 90; label: string }[] = [
  { value: 7, label: "7j" },
  { value: 30, label: "30j" },
  { value: 90, label: "90j" },
];

export default function PresetAnalyticsView({ presetId }: { presetId: string }) {
  const t = useTranslations("premium.analytics");
  const supabase = createClient();
  const { isPremium, loading: subLoading } = useSubscription();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPremium && !subLoading) {
      setError("not_premium");
      setLoading(false);
      return;
    }
    if (!isPremium) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc("get_preset_analytics", { p_preset_id: presetId, p_range_days: range })
      .then(({ data: result, error: rpcErr }) => {
        if (cancelled) return;
        if (rpcErr) {
          setError(rpcErr.message);
        } else {
          setData(result as AnalyticsData);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [presetId, range, isPremium, subLoading]);

  if (subLoading || loading) {
    return <div className="space-y-3">
      <div className="h-12 rounded-xl bg-surface-800/40 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-surface-800/40 animate-pulse" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-surface-800/40 animate-pulse" />
    </div>;
  }

  if (error === "not_premium" || error?.includes("not_premium")) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-brand-500/10 to-pink-500/10 border border-brand-500/30 p-6 text-center space-y-4">
        <p className="text-3xl">📊</p>
        <h3 className="text-white font-display font-bold text-lg">{t("paywallTitle")}</h3>
        <p className="text-surface-300 text-sm">{t("paywallDescription")}</p>
        <Link
          href="/premium"
          className="inline-block w-full py-2.5 rounded-xl bg-gradient-brand text-white font-bold glow-brand"
        >
          {t("paywallCta")}
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-center">
        <p className="text-red-400 text-sm">{t("errorTitle")}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex bg-surface-900/60 rounded-xl p-1 border border-surface-700/40 w-fit">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              range === r.value
                ? "bg-surface-800 text-white"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label={t("kpi.views")} value={data.total_views} icon="👁" />
        <KpiCard label={t("kpi.saves")} value={data.total_saves} icon="★" />
        <KpiCard label={t("kpi.shares")} value={data.total_shares} icon="↗" />
        <KpiCard
          label={t("kpi.conversion")}
          value={`${data.conversion_rate}%`}
          icon="🎯"
        />
      </div>

      {/* Sparkline simple SVG */}
      <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-4">
        <h3 className="text-surface-500 text-xs uppercase tracking-widest font-medium mb-3">
          {t("chartViews")}
        </h3>
        <Sparkline series={data.series} />
      </div>

      {/* Top countries */}
      {data.top_countries.length > 0 && (
        <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-4">
          <h3 className="text-surface-500 text-xs uppercase tracking-widest font-medium mb-3">
            {t("topCountries")}
          </h3>
          <ul className="space-y-2">
            {data.top_countries.map((c) => (
              <li key={c.country} className="flex items-center justify-between text-sm">
                <span className="text-surface-300">{c.country}</span>
                <span className="text-brand-300 font-mono">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-surface-500 text-[10px] uppercase tracking-widest font-medium">
          {label}
        </span>
        <span className="text-base opacity-50">{icon}</span>
      </div>
      <p className="text-white font-display font-bold text-2xl">{value}</p>
    </div>
  );
}

function Sparkline({ series }: { series: Array<{ day: string; views: number; saves: number }> }) {
  if (series.length === 0) {
    return <p className="text-surface-600 text-xs text-center py-8">—</p>;
  }

  const maxViews = Math.max(...series.map((s) => s.views), 1);
  const width = 100;
  const height = 40;
  const stepX = series.length > 1 ? width / (series.length - 1) : 0;

  const points = series
    .map((s, i) => {
      const x = i * stepX;
      const y = height - (s.views / maxViews) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill="url(#sparkFill)"
        stroke="none"
      />
      <polyline points={points} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
    </svg>
  );
}
