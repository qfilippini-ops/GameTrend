"use client";

import { useEffect, useState } from "react";

// ─── Types alignés avec /api/admin/dashboard/data ──────────────────────────
type DashboardData = {
  period: {
    month_start: string;
    next_month_start: string;
    day_of_month: number;
    days_in_month: number;
  };
  users: {
    total: number;
    mau: number;
    premium_active: number;
    monthly_subs: number;
    yearly_subs: number;
  };
  revenue: {
    mrr_eur_cents: number;
    arr_eur_cents: number;
    gross_month_eur_cents: number;
    net_month_eur_cents: number;
    lemon_gross_eur_cents: number;
    lemon_fees_eur_cents: number;
    extra_eur_cents: number;
    by_plan_eur_cents: Record<string, number>;
    extra_by_source_eur_cents: Record<string, number>;
    transaction_count: number;
  };
  costs: {
    fixed_monthly_total_eur_cents: number;
    fixed_consumed_to_date_eur_cents: number;
    variable_eur_cents: number;
    snapshot_eur_cents: number;
    total_to_date_eur_cents: number;
    fixed_breakdown: Array<{
      service: string;
      label: string;
      monthly_cents: number;
      note: string;
    }>;
    snapshot_by_service_eur_cents: Record<string, number>;
  };
  usage: {
    by_event: Array<{
      event_type: string;
      units: number;
      cost_eur_cents: number;
      call_count: number;
    }>;
  };
  summary: {
    gross_margin_eur_cents: number;
    gross_margin_pct: number;
    cost_per_mau_eur_cents: number;
    runway_months: number | null;
  };
};

// ─── Helpers d'affichage ────────────────────────────────────────────────────
function fmtEur(cents: number): string {
  const eur = cents / 100;
  return eur.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

function fmtNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

const EVENT_LABELS: Record<string, string> = {
  openai_navi: "Navi (OpenAI)",
  sightengine_check: "Modération images (Sightengine)",
  resend_email: "Emails (Resend)",
  livekit_token_mint: "Joins vocal (LiveKit)",
};

// ─── Composant principal ────────────────────────────────────────────────────
export default function AdminDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboard/data", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-surface-950 text-surface-100 p-6">
        <p className="text-surface-400">Chargement…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-surface-950 text-surface-100 p-6">
        <p className="text-red-400">Erreur de chargement : {error}</p>
        <button
          onClick={load}
          className="mt-4 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white"
        >
          Réessayer
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-950 text-surface-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Admin Dashboard
            </h1>
            <p className="text-sm text-surface-400 mt-1">
              Mois courant — jour {data.period.day_of_month}/
              {data.period.days_in_month}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 disabled:opacity-50"
          >
            {loading ? "…" : "Rafraîchir"}
          </button>
        </header>

        {/* KPI cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="MRR"
            value={fmtEur(data.revenue.mrr_eur_cents)}
            sub={`${data.users.premium_active} premium · ARR ${fmtEur(data.revenue.arr_eur_cents)}`}
          />
          <KpiCard
            label="MAU"
            value={fmtNumber(data.users.mau)}
            sub={`${fmtNumber(data.users.total)} comptes`}
          />
          <KpiCard
            label="Marge brute mois"
            value={fmtEur(data.summary.gross_margin_eur_cents)}
            sub={`${data.summary.gross_margin_pct}% du net`}
            tone={
              data.summary.gross_margin_eur_cents >= 0 ? "positive" : "negative"
            }
          />
          <KpiCard
            label="Coût par MAU"
            value={fmtEur(data.summary.cost_per_mau_eur_cents)}
            sub="Variables uniquement"
          />
        </section>

        {/* Revenus */}
        <section>
          <h2 className="text-lg font-bold mb-3">Revenus du mois</h2>
          <div className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-4 space-y-3">
            <Row
              label="Lemon Squeezy (brut)"
              value={fmtEur(data.revenue.lemon_gross_eur_cents)}
              sub={`${data.revenue.transaction_count} transaction${data.revenue.transaction_count > 1 ? "s" : ""}`}
            />
            <Row
              label="— Frais MoR estimés (5% + 0,46€)"
              value={`-${fmtEur(data.revenue.lemon_fees_eur_cents)}`}
              tone="negative"
            />
            {Object.entries(data.revenue.extra_by_source_eur_cents).map(
              ([source, cents]) => (
                <Row
                  key={source}
                  label={`${source} (saisi)`}
                  value={fmtEur(cents)}
                />
              )
            )}
            <div className="border-t border-surface-800/60 pt-3 flex items-center justify-between font-bold">
              <span>Total net</span>
              <span className="text-emerald-400">
                {fmtEur(data.revenue.net_month_eur_cents)}
              </span>
            </div>
            <div className="text-xs text-surface-500 space-y-1">
              {Object.entries(data.revenue.by_plan_eur_cents).map(
                ([plan, cents]) => (
                  <div key={plan} className="flex justify-between">
                    <span>· Plan {plan}</span>
                    <span>{fmtEur(cents)}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* Coûts */}
        <section>
          <h2 className="text-lg font-bold mb-3">Coûts du mois</h2>
          <div className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-4 space-y-3">
            <p className="text-xs text-surface-500">
              Fixes mensuels au prorata (J{data.period.day_of_month}/
              {data.period.days_in_month}) +
              variables consommés depuis le 1er du mois.
            </p>

            <div className="space-y-2">
              {data.costs.fixed_breakdown.map((fc) => {
                const consumed = Math.round(
                  (fc.monthly_cents * data.period.day_of_month) /
                    data.period.days_in_month
                );
                return (
                  <Row
                    key={fc.service}
                    label={fc.label}
                    sub={`${fmtEur(fc.monthly_cents)}/mois — ${fc.note}`}
                    value={fmtEur(consumed)}
                  />
                );
              })}
            </div>

            <div className="border-t border-surface-800/60 pt-3">
              <Row
                label="Coûts variables (usage_log)"
                value={fmtEur(data.costs.variable_eur_cents)}
                sub="Détail dans la section Usage"
              />
              {data.costs.snapshot_eur_cents > 0 && (
                <Row
                  label="Coûts snapshot (cron)"
                  value={fmtEur(data.costs.snapshot_eur_cents)}
                  sub="APIs externes Vercel/OpenAI/etc"
                />
              )}
            </div>

            <div className="border-t border-surface-800/60 pt-3 flex items-center justify-between font-bold">
              <span>Total coûts à date</span>
              <span className="text-red-400">
                {fmtEur(data.costs.total_to_date_eur_cents)}
              </span>
            </div>
          </div>
        </section>

        {/* Usage */}
        <section>
          <h2 className="text-lg font-bold mb-3">Usage du mois (par service)</h2>
          <div className="rounded-2xl bg-surface-900/60 border border-surface-800/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-800/40 text-surface-400 text-xs">
                <tr>
                  <th className="text-left px-4 py-2">Service</th>
                  <th className="text-right px-4 py-2">Appels</th>
                  <th className="text-right px-4 py-2">Unités</th>
                  <th className="text-right px-4 py-2">Coût EUR</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.by_event.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center text-surface-500 py-4"
                    >
                      Aucun usage enregistré ce mois.
                    </td>
                  </tr>
                ) : (
                  data.usage.by_event.map((u) => (
                    <tr
                      key={u.event_type}
                      className="border-t border-surface-800/40"
                    >
                      <td className="px-4 py-2">
                        {EVENT_LABELS[u.event_type] ?? u.event_type}
                      </td>
                      <td className="text-right px-4 py-2 text-surface-300">
                        {fmtNumber(u.call_count)}
                      </td>
                      <td className="text-right px-4 py-2 text-surface-300">
                        {fmtNumber(Math.round(u.units))}
                      </td>
                      <td className="text-right px-4 py-2 text-emerald-400 font-medium">
                        {fmtEur(u.cost_eur_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Saisie manuelle AdSense */}
        <ManualRevenueForm onSaved={load} />

        <footer className="text-center text-xs text-surface-600 pt-8">
          Itération 1 · MVP · données live
        </footer>
      </div>
    </main>
  );
}

// ─── Sous-composants ───────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-white";
  return (
    <div className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-4">
      <p className="text-[11px] uppercase tracking-wide text-surface-400">
        {label}
      </p>
      <p className={`mt-1 text-xl md:text-2xl font-bold ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-surface-500">{sub}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-white";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-surface-200">{label}</p>
        {sub && <p className="text-[11px] text-surface-500">{sub}</p>}
      </div>
      <span className={`text-sm font-medium tabular-nums ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}

function ManualRevenueForm({ onSaved }: { onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [source, setSource] = useState<"adsense" | "sponsoring" | "autre">(
    "adsense"
  );
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0) {
        setMsg("Montant invalide");
        return;
      }
      const res = await fetch("/api/admin/dashboard/manual-revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          snapshot_date: date,
          amount_cents: cents,
          currency: "EUR",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setMsg("Enregistré");
      setAmount("");
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">
        Saisie manuelle (AdSense / autres)
      </h2>
      <form
        onSubmit={submit}
        className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-4 space-y-3"
      >
        <p className="text-xs text-surface-500">
          AdSense ne propose pas d&apos;API simple en temps réel. Saisis le
          revenu manuellement (idéalement chaque début de mois pour le mois
          précédent). Upsert sur (date, source).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-surface-400">
            Source
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as typeof source)
              }
              className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm"
            >
              <option value="adsense">AdSense</option>
              <option value="sponsoring">Sponsoring</option>
              <option value="autre">Autre</option>
            </select>
          </label>
          <label className="text-xs text-surface-400">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm"
            />
          </label>
          <label className="text-xs text-surface-400">
            Montant (EUR)
            <input
              type="text"
              inputMode="decimal"
              placeholder="12.34"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm"
              required
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? "…" : "Enregistrer"}
          </button>
          {msg && (
            <span className="text-xs text-surface-400">{msg}</span>
          )}
        </div>
      </form>
    </section>
  );
}
