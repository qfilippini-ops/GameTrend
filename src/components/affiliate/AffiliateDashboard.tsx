"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AFFILIATE_CONFIG } from "@/lib/affiliate/config";
import Avatar from "@/components/ui/Avatar";

interface RecentReferral {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  joined_at: string;
  earned_cents: number;
}

interface DashboardData {
  activated: boolean;
  code: string | null;
  referrals_count: number;
  total_earned_cents: number;
  pending_earned_cents: number;
  currency: string;
  recent_referrals: RecentReferral[];
}

export default function AffiliateDashboard() {
  const t = useTranslations("affiliate");
  const tTime = useTranslations("time");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activating, setActivating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const fetchDashboard = useCallback(async () => {
    const supabase = createClient();
    const { data: raw, error: rpcErr } = await supabase.rpc("get_affiliate_dashboard");
    if (rpcErr) throw rpcErr;
    return raw as DashboardData;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.is_anonymous) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDashboard();
        if (cancelled) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, fetchDashboard]);

  async function handleActivate() {
    if (activating) return;
    setActivating(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("activate_affiliate");
      if (rpcErr) throw rpcErr;
      const fresh = await fetchDashboard();
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivating(false);
    }
  }

  function startEdit() {
    setEditValue(data?.code ?? "");
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function handleSaveCode() {
    const next = editValue.trim().toLowerCase();
    if (!AFFILIATE_CONFIG.CODE_REGEX.test(next)) {
      setEditError(t("codeInvalid"));
      return;
    }
    if (next === data?.code) {
      setEditing(false);
      return;
    }
    setSavingCode(true);
    setEditError(null);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("update_affiliate_code", {
        new_code: next,
      });
      if (rpcErr) {
        if (rpcErr.message.includes("taken")) setEditError(t("codeTaken"));
        else if (rpcErr.message.includes("invalid_format")) setEditError(t("codeInvalid"));
        else setEditError(rpcErr.message);
        return;
      }
      setData((prev) => (prev ? { ...prev, code: next } : prev));
      setEditing(false);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSavingCode(false);
    }
  }

  async function handleCopy() {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(buildLink(data.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Pas de clipboard (vieux iOS, contexte non sécurisé) — noop visible
    }
  }

  async function handleShare() {
    if (!data?.code) return;
    const url = buildLink(data.code);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: t("shareTitle"),
          text: t("shareText"),
          url,
        });
        return;
      } catch {
        // L'utilisateur a annulé ou pas de support → fallback copie
      }
    }
    await handleCopy();
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return <SkeletonDashboard />;
  }

  if (!user || user.is_anonymous) {
    return (
      <div className="text-center py-6">
        <p className="text-surface-500 text-sm mb-3">{t("subtitle")}</p>
        <Link
          href="/auth/login"
          className="inline-block px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500 transition-colors"
        >
          {t("activate")}
        </Link>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-red-300 text-sm">{t("errorTitle")}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchDashboard()
              .then((d) => setData(d))
              .catch((e) => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setLoading(false));
          }}
          className="px-4 py-2 rounded-xl bg-surface-800 text-white text-xs font-bold hover:bg-surface-700 transition-colors"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (!data?.activated) {
    return (
      <div className="space-y-3 text-center py-2">
        <p className="text-surface-400 text-sm leading-relaxed">{t("subtitle")}</p>
        <p className="text-surface-500 text-xs">
          {t("howItWorks", { rate: Math.round(AFFILIATE_CONFIG.COMMISSION_RATE * 100) })}
        </p>
        <button
          onClick={handleActivate}
          disabled={activating}
          className="mt-2 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-bold glow-brand hover:opacity-90 transition disabled:opacity-50"
        >
          {activating ? t("activating") : t("activate")}
        </button>
        {error && <p className="text-red-400 text-xs">{t("activateError")}</p>}
      </div>
    );
  }

  const link = buildLink(data.code!);

  return (
    <div className="space-y-4">
      {/* Lien + actions */}
      <div className="space-y-2">
        <label className="block text-surface-400 text-xs font-medium">{t("yourLink")}</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-800/80 border border-surface-700/50 text-white text-xs font-mono truncate"
          />
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-white text-xs font-bold transition-colors"
            >
              {copied ? t("copied") : t("copy")}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors"
            >
              {t("share")}
            </button>
          </div>
        </div>

        {!editing ? (
          <button
            onClick={startEdit}
            className="text-surface-500 hover:text-brand-400 text-[11px] underline transition-colors"
          >
            {t("editCode")}
          </button>
        ) : (
          <div className="space-y-2 p-3 rounded-xl bg-surface-800/40 border border-surface-700/40">
            <div className="flex items-center gap-2">
              <span className="text-surface-500 text-xs font-mono">.../r/</span>
              <input
                type="text"
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  setEditError(null);
                }}
                maxLength={30}
                autoFocus
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-surface-900 border border-surface-700 text-white text-sm font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
            <p className="text-surface-600 text-[11px]">{t("editCodeHint")}</p>
            {editError && <p className="text-red-400 text-xs">{editError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSaveCode}
                disabled={savingCode}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold disabled:opacity-50 transition-colors"
              >
                {t("saveCode")}
              </button>
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 rounded-lg border border-surface-700 text-surface-400 hover:text-white text-xs transition-colors"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {savedToast && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-emerald-400 text-xs"
            >
              {t("codeSaved")}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label={t("kpiReferrals")} value={String(data.referrals_count)} />
        <KpiCard
          label={t("kpiEarned")}
          value={formatAmount(data.total_earned_cents, data.currency, locale)}
        />
        <KpiCard
          label={t("kpiPending")}
          value={formatAmount(data.pending_earned_cents, data.currency, locale)}
          muted
        />
      </div>

      {/* Liste des filleuls */}
      <div className="space-y-2">
        <p className="text-surface-400 text-xs font-medium">{t("recentReferrals")}</p>
        {data.recent_referrals.length === 0 ? (
          <p className="text-surface-600 text-xs italic py-3">{t("empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.recent_referrals.map((r) => (
              <li key={r.user_id}>
                <Link
                  href={`/profile/${r.user_id}`}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-800/40 transition-colors"
                >
                  <Avatar src={r.avatar_url} name={r.username} size="sm" className="rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{r.username ?? "—"}</p>
                    <p className="text-surface-600 text-[11px]">
                      {t("joinedAgo", { ago: relativeTime(r.joined_at, tTime, locale) })}
                    </p>
                  </div>
                  <p className="text-brand-300 text-xs font-bold shrink-0">
                    {formatAmount(r.earned_cents, data.currency, locale)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer info légal */}
      <div className="pt-2 space-y-1">
        <p className="text-surface-600 text-[11px] leading-snug">
          {t("howItWorks", { rate: Math.round(AFFILIATE_CONFIG.COMMISSION_RATE * 100) })}
        </p>
        <p className="text-surface-700 text-[11px] leading-snug">
          {t("legalNote", { days: AFFILIATE_CONFIG.PENDING_DAYS })}
        </p>
      </div>
    </div>
  );
}

// ─── Sous-composants & helpers ─────────────────────────────────────────────

function KpiCard({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="p-2.5 rounded-xl bg-surface-800/40 border border-surface-700/40 text-center">
      <p
        className={`font-display font-black text-base leading-tight ${
          muted ? "text-surface-400" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="text-surface-600 text-[10px] uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-9 rounded-xl bg-surface-800/60" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-14 rounded-xl bg-surface-800/40" />
        <div className="h-14 rounded-xl bg-surface-800/40" />
        <div className="h-14 rounded-xl bg-surface-800/40" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-surface-800/60" />
        <div className="h-10 rounded-xl bg-surface-800/40" />
        <div className="h-10 rounded-xl bg-surface-800/40" />
      </div>
    </div>
  );
}

function buildLink(code: string): string {
  // En SSR, on n'a pas window. On utilise NEXT_PUBLIC_APP_URL comme fallback,
  // sinon on construit un placeholder relatif que le user verra une fois hydraté.
  if (typeof window !== "undefined") {
    return `${window.location.origin}/r/${code}`;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://gametrend.fr";
  return `${base.replace(/\/$/, "")}/r/${code}`;
}

function formatAmount(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type TimeT = ReturnType<typeof useTranslations<"time">>;

function relativeTime(iso: string, tTime: TimeT, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return tTime("now");
  if (m < 60) return tTime("minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tTime("hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d < 60) return tTime("daysAgo", { n: d });
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR");
}
