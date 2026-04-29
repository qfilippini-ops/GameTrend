"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getDefaultInputs,
  getHostingerPlans,
  getSupabasePlans,
  getVercelPlans,
  simulate,
  type HostingerPlan,
  type SimulatorInputs,
  type SupabasePlan,
  type VercelPlan,
} from "@/lib/admin/simulator";

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}
function fmtNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

// ─── Stockage local des scénarios ───────────────────────────────────────────
const STORAGE_KEY = "gt_admin_simulator_v2";

function loadStored(): SimulatorInputs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SimulatorInputs;
  } catch {
    return null;
  }
}
function saveStored(inputs: SimulatorInputs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    // Quota dépassé, on ignore
  }
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function SimulatorClient() {
  const [inputs, setInputs] = useState<SimulatorInputs>(() => {
    return loadStored() ?? getDefaultInputs();
  });
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineMsg, setBaselineMsg] = useState<string | null>(null);

  useEffect(() => {
    saveStored(inputs);
  }, [inputs]);

  const outputs = useMemo(() => simulate(inputs), [inputs]);

  function update<K extends keyof SimulatorInputs>(
    key: K,
    value: SimulatorInputs[K]
  ) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function loadBaseline() {
    setBaselineLoading(true);
    setBaselineMsg(null);
    try {
      const res = await fetch("/api/admin/simulator/baseline", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        audience: {
          totalUsers: number;
          mau: number;
          mauRatePct: number;
          premiumActive: number;
          premiumConversionPct: number;
        };
        mix: {
          monthlySharePct: number;
          yearlySharePct: number;
          lifetimeSharePct: number;
        };
        usage: {
          naviCallsPerPremiumPerMonth: number;
          imagesUploadedPerMauPerMonth: number;
          emailsPerMauPerMonth: number;
          voiceMinutesPerPremiumPerMonth: number;
        };
      };
      setInputs((prev) => ({
        ...prev,
        totalUsers: data.audience.totalUsers,
        mauRatePct: data.audience.mauRatePct,
        premiumConversionPct: data.audience.premiumConversionPct,
        monthlySharePct: data.mix.monthlySharePct,
        yearlySharePct: data.mix.yearlySharePct,
        lifetimeSharePct: data.mix.lifetimeSharePct,
        naviCallsPerPremiumPerMonth: data.usage.naviCallsPerPremiumPerMonth,
        imagesUploadedPerMauPerMonth:
          data.usage.imagesUploadedPerMauPerMonth,
        emailsPerMauPerMonth: data.usage.emailsPerMauPerMonth,
        voiceMinutesPerPremiumPerMonth:
          data.usage.voiceMinutesPerPremiumPerMonth,
      }));
      setBaselineMsg(
        `Chargé : ${data.audience.totalUsers} comptes · ${data.audience.mau} MAU · ${data.audience.premiumActive} premium`
      );
    } catch (e) {
      setBaselineMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBaselineLoading(false);
    }
  }

  function reset() {
    setInputs(getDefaultInputs());
    setBaselineMsg("Réinitialisé aux valeurs par défaut");
  }

  return (
    // max-w-none + larges paddings pour exploiter le PC
    <main className="min-h-screen bg-surface-950 text-surface-100">
      <div className="max-w-[1700px] mx-auto p-4 lg:p-6 space-y-5">
        {/* ─── Header ───────────────────────────────────────────────── */}
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">
              Simulateur de scale
            </h1>
            <p className="text-sm text-surface-400 mt-1">
              Joue sur les hypothèses, les coûts se recalculent
              automatiquement.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/fr/admin/dashboard"
              className="px-3 py-1.5 text-sm rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200"
            >
              ← Dashboard
            </Link>
            <button
              onClick={loadBaseline}
              disabled={baselineLoading}
              className="px-3 py-1.5 text-sm rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 disabled:opacity-50"
            >
              {baselineLoading ? "…" : "Charger valeurs actuelles"}
            </button>
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200"
            >
              Réinitialiser
            </button>
          </div>
        </header>

        {baselineMsg && (
          <p className="text-xs text-surface-500">{baselineMsg}</p>
        )}

        {/* ─── KPI Hero ─────────────────────────────────────────────── */}
        <HeroBar outputs={outputs} />

        {/* ─── Layout principal ─────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px]">
          {/* Inputs en grille */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Section title="Audience">
              <NumberRow
                label="Total comptes inscrits"
                value={inputs.totalUsers}
                onChange={(v) => update("totalUsers", v)}
                step={100}
                min={0}
                info={
                  <>
                    Nombre cumulatif de comptes créés depuis le lancement
                    (actifs ou inactifs). Sert de base pour calculer le MAU
                    et le nombre de lifetime acquis ce mois.
                    <br />
                    <strong>Impact :</strong> ↑ → ↑ revenus pub (free
                    actifs), ↑ achats lifetime, ↑ coûts storage/modération.
                  </>
                }
              />
              <SliderRow
                label="% comptes actifs (MAU)"
                value={inputs.mauRatePct}
                onChange={(v) => update("mauRatePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Portion des inscrits qui se connectent au moins 1× sur
                    30 jours. Calculé via{" "}
                    <code>profiles.last_seen_at</code>.
                    <br />
                    <strong>Repères :</strong> 70% = excellent au lancement,
                    30-50% = typique en année 2-3 sur app sociale.
                  </>
                }
              />
            </Section>

            <Section title="Conversion premium">
              <SliderRow
                label="% MAU → Premium"
                value={inputs.premiumConversionPct}
                onChange={(v) => update("premiumConversionPct", v)}
                min={0}
                max={50}
                step={0.5}
                suffix="%"
                info={
                  <>
                    LA métrique business clé : portion d&apos;utilisateurs
                    actifs qui souscrivent.
                    <br />
                    <strong>Repères :</strong> 1-3% = standard freemium,
                    5% = bon, &gt;10% = exceptionnel (Spotify ~46%, mais
                    paywall obligatoire).
                  </>
                }
              />
              <SliderRow
                label="% Premium via affilié"
                value={inputs.affiliateAcquisitionPct}
                onChange={(v) => update("affiliateAcquisitionPct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Portion des nouveaux abonnés arrivés via un lien{" "}
                    <code>/r/&lt;code&gt;</code>. ↑ génère plus de
                    commissions à reverser, mais souvent rentable car
                    remplace de la pub payante.
                  </>
                }
              />
              <SliderRow
                label="Commission affilié"
                value={inputs.affiliateCommissionRatePct}
                onChange={(v) => update("affiliateCommissionRatePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Ce que tu reverses à l&apos;ambassadeur, calculé sur le
                    NET (après 5% Lemon).
                    <br />
                    Réglage actuel app : 40% (
                    <code>src/lib/affiliate/config.ts</code>).
                  </>
                }
              />
            </Section>

            <Section title="Mix Premium (normalisé 100%)">
              <SliderRow
                label="Monthly"
                value={inputs.monthlySharePct}
                onChange={(v) => update("monthlySharePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Part des premium qui choisissent le mensuel. MRR stable
                    mais churn plus élevé.
                  </>
                }
              />
              <SliderRow
                label="Yearly"
                value={inputs.yearlySharePct}
                onChange={(v) => update("yearlySharePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Cashflow upfront, meilleure rétention. ARPU mensuel
                    plus bas (4,08 €/mois eq pour 49 €/an).
                  </>
                }
              />
              <SliderRow
                label="Lifetime"
                value={inputs.lifetimeSharePct}
                onChange={(v) => update("lifetimeSharePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Limité aux 100 premiers comptes. Contribue 0 € au MRR
                    mais reste premium ad vitam (coûts continus).
                  </>
                }
              />
              <SliderRow
                label="% comptes achetant Lifetime ce mois"
                value={inputs.lifetimeMonthlyAcquisitionPct}
                onChange={(v) =>
                  update("lifetimeMonthlyAcquisitionPct", v)
                }
                min={0}
                max={5}
                step={0.1}
                suffix="%"
                info={
                  <>
                    Taux de NOUVEAUX achats lifetime ce mois (one-shot).
                    0,5-2% au lancement (FOMO 100 places), 0% après
                    épuisement.
                  </>
                }
              />
            </Section>

            <Section title="Tarifs (centimes EUR)">
              <NumberRow
                label="Monthly"
                value={inputs.monthlyPriceCents}
                onChange={(v) => update("monthlyPriceCents", v)}
                hint={`= ${fmtEur(inputs.monthlyPriceCents)}/mois`}
                info={
                  <>
                    Élasticité prix : au-dessus de 9-10 €, le taux de
                    conversion baisse souvent significativement (à tester).
                  </>
                }
              />
              <NumberRow
                label="Yearly"
                value={inputs.yearlyPriceCents}
                onChange={(v) => update("yearlyPriceCents", v)}
                hint={`= ${fmtEur(inputs.yearlyPriceCents)}/an = ${fmtEur(Math.round(inputs.yearlyPriceCents / 12))}/mois`}
                info={
                  <>
                    Standard SaaS = -20 à -50% vs monthly pour inciter à
                    l&apos;engagement annuel.
                  </>
                }
              />
              <NumberRow
                label="Lifetime"
                value={inputs.lifetimePriceCents}
                onChange={(v) => update("lifetimePriceCents", v)}
                hint={`= ${fmtEur(inputs.lifetimePriceCents)} unique`}
                info={
                  <>
                    Bonne pratique : 12-24× le prix monthly. 99 € = 14×
                    monthly → break-even si l&apos;utilisateur reste 14
                    mois.
                  </>
                }
              />
            </Section>

            <Section title="Hypothèses d'usage">
              <SliderRow
                label="Calls Navi par premium / mois"
                value={inputs.naviCallsPerPremiumPerMonth}
                onChange={(v) =>
                  update("naviCallsPerPremiumPerMonth", v)
                }
                min={0}
                max={200}
                suffix=" calls"
                info={
                  <>
                    Nombre moyen d&apos;arbitrages Navi (Outbid) par
                    premium/mois. <strong>Coût unitaire :</strong> ~0,025 c
                    par call (gpt-5-nano, ~2500 tokens reasoning + output).
                    <br />
                    <br />
                    <strong>Repères :</strong> 5 = utilisateur occasionnel,
                    20 = standard, 50+ = power user.
                  </>
                }
              />
              <SliderRow
                label="Images uploadées par MAU / mois"
                value={inputs.imagesUploadedPerMauPerMonth}
                onChange={(v) =>
                  update("imagesUploadedPerMauPerMonth", v)
                }
                min={0}
                max={50}
                suffix=" images"
                info={
                  <>
                    Covers presets, avatars, bannières.{" "}
                    <strong>Coût unitaire :</strong> ~0,1 c par image
                    (Sightengine modération).
                  </>
                }
              />
              <SliderRow
                label="Emails envoyés par MAU / mois"
                value={inputs.emailsPerMauPerMonth}
                onChange={(v) => update("emailsPerMauPerMonth", v)}
                min={0}
                max={20}
                suffix=" emails"
                info={
                  <>
                    Welcome + lifecycle abos + notifs.{" "}
                    <strong>Coût :</strong> 0 c sous 3000 emails/mois
                    (Resend Free), puis ~0,04 c/email au-delà.
                  </>
                }
              />
              <SliderRow
                label="Minutes vocal par premium / mois"
                value={inputs.voiceMinutesPerPremiumPerMonth}
                onChange={(v) =>
                  update("voiceMinutesPerPremiumPerMonth", v)
                }
                min={0}
                max={300}
                step={5}
                suffix=" min"
                info={
                  <>
                    Durée moyenne en vocal LiveKit par premium/mois.{" "}
                    <strong>Coût :</strong> 0 € tant que tu ne satures pas
                    le VPS. Sert juste au capacity planning (warning si
                    pic dépasse capacité KVM).
                  </>
                }
              />
              <SliderRow
                label="MB stockés par MAU"
                value={inputs.storageMbPerMau}
                onChange={(v) => update("storageMbPerMau", v)}
                min={0}
                max={100}
                step={1}
                suffix=" MB"
                info={
                  <>
                    Taille moyenne stockée par utilisateur (avatar +
                    covers + bannière). <strong>Coût :</strong> 0 € sous
                    le quota Supabase, sinon ~0,021 $/GB.
                  </>
                }
              />
              <SliderRow
                label="Pages vues par actif / mois"
                value={inputs.pageViewsPerActiveUser}
                onChange={(v) => update("pageViewsPerActiveUser", v)}
                min={0}
                max={500}
                step={10}
                suffix=" pages"
                info={
                  <>
                    Détermine le bandwidth Vercel ET les impressions pub
                    AdSense (pour les free uniquement).
                    <br />
                    Repères : 30 = ~1 page/jour, 60 = ~2/jour, 200 = power
                    user.
                  </>
                }
              />
            </Section>

            <Section title="Revenus pub (AdSense, free only)">
              <NumberRow
                label="RPM (€ / 1000 impressions)"
                value={inputs.adsenseRpmEur}
                onChange={(v) => update("adsenseRpmEur", v)}
                step={0.1}
                hint="Gaming/social FR : 0,30 → 1 €"
                info={
                  <>
                    Revenue Per Mille AdSense. Très variable. Trouvable
                    dans ton dashboard AdSense après 1-2 mois d&apos;usage.
                  </>
                }
              />
              <NumberRow
                label="Slots pub par page"
                value={inputs.adSlotsPerPage}
                onChange={(v) => update("adSlotsPerPage", v)}
                step={1}
                info={
                  <>
                    Compte tes <code>&lt;AdSlot /&gt;</code> dans le code.
                    Trade-off ↑ revenus mais ↓ UX.
                  </>
                }
              />
              <SliderRow
                label="% consentement RGPD"
                value={inputs.adsConsentPct}
                onChange={(v) => update("adsConsentPct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    60% est typique en EU. Sans consentement, AdSense
                    affiche pub non personnalisée (RPM 3-5× plus bas) ou
                    rien.
                  </>
                }
              />
            </Section>

            <Section title="Coûts fixes (paliers infra)">
              <SelectRow
                label="Plan Vercel"
                value={inputs.vercelPlan}
                onChange={(v) => update("vercelPlan", v as VercelPlan)}
                options={Object.entries(getVercelPlans()).map(
                  ([k, v]) => ({ value: k, label: v.label })
                )}
                info={
                  <>
                    <strong>Quand upgrade ?</strong>
                    <br />· <strong>Hobby</strong> : ~3-5K MAU. ⚠ Interdit
                    usage commercial → Pro dès monétisation.
                    <br />· <strong>Pro</strong> : ~50-100K MAU.
                    <br />· <strong>Enterprise</strong> : 100K+ MAU ou
                    SLA dédié.
                  </>
                }
              />
              <SelectRow
                label="Plan Supabase"
                value={inputs.supabasePlan}
                onChange={(v) =>
                  update("supabasePlan", v as SupabasePlan)
                }
                options={Object.entries(getSupabasePlans()).map(
                  ([k, v]) => ({ value: k, label: v.label })
                )}
                info={
                  <>
                    <strong>Quand upgrade ?</strong>
                    <br />· <strong>Free</strong> : ~2-3K MAU. ⚠ Pause
                    après 7j inactivité = casse la prod.
                    <br />· <strong>Pro</strong> : ~50K MAU. Recommandé
                    dès lancement public.
                    <br />· <strong>Team</strong> : 100K-1M MAU.
                  </>
                }
              />
              <SelectRow
                label="VPS Hostinger (LiveKit voice)"
                value={inputs.hostingerVpsPlan}
                onChange={(v) =>
                  update("hostingerVpsPlan", v as HostingerPlan)
                }
                options={Object.entries(getHostingerPlans()).map(
                  ([k, v]) => ({ value: k, label: v.label })
                )}
                info={
                  <>
                    En supposant ~10% premium en vocal aux pics :
                    <br />· <strong>KVM 2</strong> : ~500 premium
                    <br />· <strong>KVM 4</strong> : ~1 200 premium
                    <br />· <strong>KVM 8</strong> : ~3 000 premium
                    <br />· <strong>Cloud Startup</strong> : ~6 000 premium
                  </>
                }
              />
              <NumberRow
                label="Autres fixes (centimes EUR/mois)"
                value={inputs.otherFixedCostsCents}
                onChange={(v) => update("otherFixedCostsCents", v)}
                hint="Domaine, comptable, monitoring..."
                info={
                  <>
                    Domaine .fr (~100 c), comptable SASU (~5000 c), Sentry
                    (0-2600 c), assurance pro RC, etc.
                  </>
                }
              />
            </Section>
          </div>

          {/* ─── Résultats sticky droite ─────────────────────────────── */}
          <aside className="lg:sticky lg:top-4 self-start space-y-3 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
            <ResultsPanel outputs={outputs} />
          </aside>
        </div>
      </div>
    </main>
  );
}

// ─── KPI Hero (full width, top) ─────────────────────────────────────────────

function HeroBar({ outputs }: { outputs: ReturnType<typeof simulate> }) {
  const margeColor =
    outputs.grossMarginCents >= 0 ? "text-emerald-400" : "text-red-400";
  const margeBg =
    outputs.grossMarginCents >= 0
      ? "from-emerald-500/10 to-transparent"
      : "from-red-500/10 to-transparent";

  return (
    <div
      className={`rounded-2xl border border-surface-800/60 bg-gradient-to-r ${margeBg} bg-surface-900/80 p-4 lg:p-5`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-400">
            Marge brute mensuelle
          </p>
          <p className={`text-2xl lg:text-3xl font-bold ${margeColor}`}>
            {fmtEur(outputs.grossMarginCents)}
          </p>
          <p className="text-xs text-surface-500">
            {outputs.marginPct.toFixed(1)}% ·{" "}
            {outputs.isProfitable ? "Profitable" : "Non rentable"}
          </p>
        </div>
        <KpiBlock
          label="MAU"
          value={fmtNumber(outputs.mau)}
          sub={`${fmtNumber(outputs.freeActive)} free / ${fmtNumber(outputs.premiumActive)} premium`}
        />
        <KpiBlock
          label="Revenu net / mois"
          value={fmtEur(outputs.totalNetRevenueCents)}
          sub={`Brut ${fmtEur(outputs.totalGrossRevenueCents)}`}
        />
        <KpiBlock
          label="Coûts / mois"
          value={fmtEur(outputs.totalCostsCents)}
          sub={`Fixes ${fmtEur(outputs.fixedCostsTotalCents)} + Var ${fmtEur(outputs.variableCostsTotalCents)}`}
          tone="negative"
        />
        <KpiBlock
          label="ARPU / ARPPU"
          value={`${fmtEur(outputs.arpuCents)} / ${fmtEur(outputs.arppuCents)}`}
          sub={`Coût/MAU ${fmtEur(outputs.costPerMauCents)}`}
        />
      </div>
    </div>
  );
}

function KpiBlock({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "negative";
}) {
  const valueColor = tone === "negative" ? "text-red-400" : "text-white";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-surface-400">
        {label}
      </p>
      <p className={`text-xl lg:text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-surface-500">{sub}</p>}
    </div>
  );
}

// ─── InfoIcon avec portal ───────────────────────────────────────────────────

function InfoIcon({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const tooltipWidth = 288;
      const margin = 12;
      const overflowsRight =
        rect.right + tooltipWidth + margin > window.innerWidth;
      setCoords({
        left: overflowsRight
          ? Math.max(margin, rect.left - tooltipWidth - 8)
          : rect.right + 8,
        top: rect.top,
      });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Plus d'informations"
        onClick={toggle}
        className="inline-flex w-4 h-4 rounded-full bg-surface-700 hover:bg-surface-600 text-surface-200 text-[10px] font-bold items-center justify-center shrink-0"
      >
        i
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              zIndex: 9999,
              width: 288,
              maxWidth: "calc(100vw - 24px)",
            }}
            className="p-3 rounded-lg bg-surface-950 border border-surface-700 text-[11px] text-surface-200 leading-snug shadow-2xl"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

function LabelWithInfo({
  label,
  info,
}: {
  label: string;
  info?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {info && <InfoIcon>{info}</InfoIcon>}
    </span>
  );
}

// ─── Sections / Rows ────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-4">
      <p className="font-bold text-xs uppercase tracking-wide text-surface-200 mb-3">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  step = 1,
  min,
  hint,
  info,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  hint?: string;
  info?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-surface-400 mb-1">
        <LabelWithInfo label={label} info={info} />
      </label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm w-full"
      />
      {hint && (
        <p className="text-[10px] text-surface-500 mt-1">{hint}</p>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  info,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  info?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center mb-1 gap-2">
        <label className="text-xs text-surface-400 truncate">
          <LabelWithInfo label={label} info={info} />
        </label>
        <span className="text-xs text-white font-medium tabular-nums whitespace-nowrap">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand-500"
      />
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
  info,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  info?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-surface-400 mb-1">
        <LabelWithInfo label={label} info={info} />
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm w-full"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Panneau résultats ──────────────────────────────────────────────────────

function ResultsPanel({
  outputs,
}: {
  outputs: ReturnType<typeof simulate>;
}) {
  return (
    <>
      {/* Warnings en haut */}
      {outputs.warnings.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
            ⚠ Alertes paliers
          </p>
          {outputs.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-200/90">
              {w}
            </p>
          ))}
        </div>
      )}

      <Card title="Audience">
        <Line label="MAU" v={fmtNumber(outputs.mau)} />
        <Line label="Free actifs" v={fmtNumber(outputs.freeActive)} />
        <Line
          label="Premium actifs"
          v={fmtNumber(outputs.premiumActive)}
          highlight
        />
        <Line label="· monthly" v={fmtNumber(outputs.monthlyCount)} small />
        <Line label="· yearly" v={fmtNumber(outputs.yearlyCount)} small />
        <Line label="· lifetime" v={fmtNumber(outputs.lifetimeCount)} small />
        <Line
          label="Nouveaux lifetime ce mois"
          v={fmtNumber(outputs.newLifetimeThisMonth)}
          small
        />
        <Line
          label="Acquis via affilié"
          v={fmtNumber(outputs.affiliateAcquired)}
          small
        />
      </Card>

      <Card title="Usage agrégé">
        <Line label="Calls Navi" v={fmtNumber(outputs.totalNaviCalls)} small />
        <Line
          label="Images modérées"
          v={fmtNumber(outputs.totalImagesModerated)}
          small
        />
        <Line
          label="Emails envoyés"
          v={fmtNumber(outputs.totalEmails)}
          small
        />
        <Line
          label="Minutes vocal"
          v={fmtNumber(outputs.totalVoiceMinutes)}
          small
        />
        <Line
          label="Stockage"
          v={`${outputs.totalStorageGb.toFixed(2)} GB`}
          small
        />
        <Line
          label="Pages vues"
          v={fmtNumber(outputs.totalPageViews)}
          small
        />
        <Line
          label="Bandwidth ~"
          v={`${outputs.estimatedBandwidthGb.toFixed(2)} GB`}
          small
        />
      </Card>

      <Card title="Revenus mensuels">
        <Line label="MRR Monthly" v={fmtEur(outputs.mrrFromMonthlyCents)} />
        <Line
          label="MRR Yearly (/12)"
          v={fmtEur(outputs.mrrFromYearlyCents)}
        />
        <Line
          label="Lifetime ce mois"
          v={fmtEur(outputs.lifetimeOneShotCents)}
        />
        <Line
          label="Lemon brut"
          v={fmtEur(outputs.lemonGrossRevenueCents)}
          highlight
        />
        <Line
          label="− Frais MoR"
          v={`-${fmtEur(outputs.lemonFeesCents)}`}
          negative
        />
        <Line
          label="− Commissions affiliés"
          v={`-${fmtEur(outputs.affiliateCommissionsCents)}`}
          negative
        />
        <Line label="+ AdSense" v={fmtEur(outputs.adsenseRevenueCents)} />
        <Line
          label="Net total"
          v={fmtEur(outputs.totalNetRevenueCents)}
          highlight
          positive
        />
      </Card>

      <Card title="Coûts variables">
        <Line label="Navi (OpenAI)" v={fmtEur(outputs.naviCostCents)} />
        <Line label="Modération" v={fmtEur(outputs.moderationCostCents)} />
        <Line label="Emails" v={fmtEur(outputs.emailCostCents)} />
        <Line
          label="Voice bandwidth"
          v={fmtEur(outputs.voiceBandwidthCostCents)}
        />
        <Line label="Storage" v={fmtEur(outputs.storageCostCents)} />
        <Line
          label="Total variables"
          v={fmtEur(outputs.variableCostsTotalCents)}
          highlight
        />
      </Card>

      <Card title="Coûts fixes">
        <Line label="Vercel" v={fmtEur(outputs.vercelCostCents)} />
        <Line label="Supabase" v={fmtEur(outputs.supabaseCostCents)} />
        <Line label="Hostinger VPS" v={fmtEur(outputs.hostingerCostCents)} />
        <Line label="Autres" v={fmtEur(outputs.otherFixedCostsCents)} />
        <Line
          label="Total fixes"
          v={fmtEur(outputs.fixedCostsTotalCents)}
          highlight
        />
      </Card>

      <Card title="Synthèse">
        <Line
          label="Total coûts"
          v={fmtEur(outputs.totalCostsCents)}
          negative
        />
        <Line
          label="Marge brute"
          v={fmtEur(outputs.grossMarginCents)}
          highlight
          positive={outputs.grossMarginCents >= 0}
          negative={outputs.grossMarginCents < 0}
        />
        <Line label="ARPU (par MAU)" v={fmtEur(outputs.arpuCents)} small />
        <Line
          label="ARPPU (par premium)"
          v={fmtEur(outputs.arppuCents)}
          small
        />
        <Line label="Coût / MAU" v={fmtEur(outputs.costPerMauCents)} small />
        <Line
          label="Coût / premium"
          v={fmtEur(outputs.costPerPremiumCents)}
          small
        />
      </Card>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-surface-400 mb-2">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({
  label,
  v,
  highlight,
  positive,
  negative,
  small,
}: {
  label: string;
  v: string;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
  small?: boolean;
}) {
  const valColor = positive
    ? "text-emerald-400"
    : negative
      ? "text-red-400"
      : "text-white";
  return (
    <div
      className={`flex justify-between items-center gap-3 ${highlight ? "border-t border-surface-800/40 pt-1.5 mt-1" : ""}`}
    >
      <span
        className={`${small ? "text-[11px] text-surface-500" : "text-xs text-surface-300"}`}
      >
        {label}
      </span>
      <span
        className={`${small ? "text-[11px]" : "text-sm"} ${valColor} ${highlight ? "font-bold" : "font-medium"} tabular-nums whitespace-nowrap`}
      >
        {v}
      </span>
    </div>
  );
}
