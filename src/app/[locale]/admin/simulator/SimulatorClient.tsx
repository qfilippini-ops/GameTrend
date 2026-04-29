"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
const STORAGE_KEY = "gt_admin_simulator_v1";

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

  // Sauvegarde automatique des inputs (un changement = persist)
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
        variableCosts: {
          naviCostPerPremiumCents: number;
          moderationCostPerMauCents: number;
          emailCostPerMauCents: number;
          voiceBandwidthCostPerPremiumCents: number;
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
        naviCostPerPremiumCents: data.variableCosts.naviCostPerPremiumCents,
        moderationCostPerMauCents:
          data.variableCosts.moderationCostPerMauCents,
        emailCostPerMauCents: data.variableCosts.emailCostPerMauCents,
        voiceBandwidthCostPerPremiumCents:
          data.variableCosts.voiceBandwidthCostPerPremiumCents,
      }));
      setBaselineMsg(
        `Chargé : ${data.audience.totalUsers} comptes, ${data.audience.mau} MAU, ${data.audience.premiumActive} premium`
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
    <main className="min-h-screen bg-surface-950 text-surface-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Simulateur de scale
            </h1>
            <p className="text-sm text-surface-400 mt-1">
              Joue sur les paramètres pour anticiper coûts et revenus à
              différentes échelles.
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* ─── Inputs ────────────────────────────────────────────────── */}
          <div className="space-y-5">
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
                    <strong>Impact :</strong> ↑ → ↑ revenus pub (free actifs),
                    ↑ achats lifetime, ↑ coûts storage/modération.
                  </>
                }
              />
              <SliderRow
                label="% de comptes actifs (MAU rate)"
                value={inputs.mauRatePct}
                onChange={(v) => update("mauRatePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Portion des inscrits qui se connectent au moins 1× sur
                    30 jours. Calculé via <code>profiles.last_seen_at</code>.
                    <br />
                    <strong>Repères :</strong> 70% = excellent au lancement,
                    30-50% = typique en année 2-3 sur app sociale.
                    <br />
                    <strong>Impact :</strong> ↑ → ↑ MAU, ↑ pool de conversion
                    premium, ↑ pages vues = ↑ pub.
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
                    actifs qui souscrivent (toutes formules confondues).
                    <br />
                    <strong>Repères :</strong> 1-3% = standard freemium,
                    5% = bon, &gt;10% = exceptionnel (Spotify ~46%, mais
                    c&apos;est du paywall obligatoire).
                    <br />
                    <strong>Impact :</strong> levier #1 sur le revenu, doublé
                    le taux double quasi tout (MRR + ARR + lifetime).
                  </>
                }
              />
              <SliderRow
                label="% Premium acquis via affilié"
                value={inputs.affiliateAcquisitionPct}
                onChange={(v) => update("affiliateAcquisitionPct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Portion des nouveaux abonnés arrivés via le lien d&apos;un
                    ambassadeur (système actuel : <code>/r/&lt;code&gt;</code>).
                    <br />
                    <strong>Impact :</strong> ↑ génère plus de commissions à
                    reverser MAIS souvent rentable car remplace de la pub
                    payante (CAC plus bas). Sans budget acquisition,
                    20-40% est un bon objectif via tes early adopters.
                  </>
                }
              />
              <SliderRow
                label="Commission affilié sur le net"
                value={inputs.affiliateCommissionRatePct}
                onChange={(v) => update("affiliateCommissionRatePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Ce que tu reverses à l&apos;ambassadeur, calculé sur le
                    montant NET (après les 5% de frais Lemon).
                    <br />
                    <strong>Réglage actuel :</strong> 40%, défini dans
                    <code>src/lib/affiliate/config.ts</code>.
                    <br />
                    <strong>Repères :</strong> 20% = conservateur, 30-40% =
                    standard SaaS, 50%+ = très généreux (utilisé par certains
                    pour booster le bouche-à-oreille au lancement).
                  </>
                }
              />
            </Section>

            <Section title="Mix Premium (somme normalisée à 100%)">
              <SliderRow
                label="Monthly"
                value={inputs.monthlySharePct}
                onChange={(v) => update("monthlySharePct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Part des premium qui choisissent le plan mensuel
                    (6,99 €). MRR récurrent stable, mais churn plus élevé
                    (résiliation facile chaque mois).
                    <br />
                    <strong>Impact :</strong> ↑ → ↑ MRR direct mais cashflow
                    plus volatil.
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
                    Part des premium qui choisissent le plan annuel (49 €).
                    Cashflow upfront, meilleure rétention (pas de friction
                    mensuelle), mais ARPU mensuel plus bas (4,08 €/mois eq).
                    <br />
                    <strong>Impact :</strong> ↑ → ↑ trésorerie immédiate, ↓
                    MRR pur mais ↑ stabilité.
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
                    Part des premium qui ont acheté le lifetime (99 €,
                    limité aux 100 premiers comptes). Contribue 0 € au MRR
                    mais reste premium ad vitam (coûts variables continus).
                    <br />
                    <strong>Impact :</strong> ↑ → boost initial revenu mais
                    aucune récurrence après.
                  </>
                }
              />
              <SliderRow
                label="% de comptes achetant un Lifetime ce mois"
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
                    Taux de NOUVEAUX achats lifetime ce mois (one-shot, pas
                    récurrent). Influencé par les early adopters, le FOMO
                    sur les 100 premiers, tes campagnes.
                    <br />
                    <strong>Repères :</strong> 0,5-2% au lancement, 0% après
                    épuisement des 100 places.
                  </>
                }
              />
            </Section>

            <Section title="Tarifs">
              <NumberRow
                label="Monthly (centimes EUR)"
                value={inputs.monthlyPriceCents}
                onChange={(v) => update("monthlyPriceCents", v)}
                hint={`= ${fmtEur(inputs.monthlyPriceCents)}/mois`}
                info={
                  <>
                    Prix du plan mensuel en centimes (699 = 6,99 €). Augmenter
                    de 1 € = +14% revenu pour le même nombre de premium si
                    aucun churn n&apos;est induit.
                    <br />
                    <strong>Élasticité :</strong> au-dessus de 9-10 € le taux
                    de conversion baisse souvent significativement (à tester).
                  </>
                }
              />
              <NumberRow
                label="Yearly (centimes EUR)"
                value={inputs.yearlyPriceCents}
                onChange={(v) => update("yearlyPriceCents", v)}
                hint={`= ${fmtEur(inputs.yearlyPriceCents)}/an = ${fmtEur(Math.round(inputs.yearlyPriceCents / 12))}/mois`}
                info={
                  <>
                    Prix du plan annuel. Réduction implicite : 49 €/an =
                    4,08 €/mois soit -42% vs monthly. Standard SaaS = -20 à
                    -50% pour inciter à l&apos;engagement annuel.
                  </>
                }
              />
              <NumberRow
                label="Lifetime (centimes EUR)"
                value={inputs.lifetimePriceCents}
                onChange={(v) => update("lifetimePriceCents", v)}
                hint={`= ${fmtEur(inputs.lifetimePriceCents)} unique`}
                info={
                  <>
                    Prix du lifetime (one-shot). Bonne pratique : 12-24× le
                    prix monthly pour rester rentable. Ici 99 € = 14×
                    monthly → break-even si l&apos;utilisateur reste 14 mois
                    (ce qu&apos;il fera s&apos;il a payé lifetime).
                  </>
                }
              />
            </Section>

            <Section title="Coûts variables (centimes EUR)">
              <NumberRow
                label="Coût Navi par premium / mois"
                value={inputs.naviCostPerPremiumCents}
                onChange={(v) => update("naviCostPerPremiumCents", v)}
                hint="OpenAI gpt-5-nano. Varie selon usage Outbid."
                info={
                  <>
                    Coût moyen OpenAI par utilisateur premium et par mois,
                    en centimes EUR. Calculé via tokens × tarif
                    gpt-5-nano (0,05 $/M input, 0,40 $/M output).
                    <br />
                    <strong>Référence :</strong> 1 verdict Navi typique
                    (~2000 tokens reasoning + 500 output) ≈ 0,025 c. Donc
                    5 c/mois = 200 verdicts/premium/mois.
                  </>
                }
              />
              <NumberRow
                label="Coût modération par MAU / mois"
                value={inputs.moderationCostPerMauCents}
                onChange={(v) => update("moderationCostPerMauCents", v)}
                hint="Sightengine ~0,1c/image. Dépend du nb d'uploads."
                info={
                  <>
                    Sightengine vérifie chaque image uploadée (covers
                    presets, avatars, bannières). ~0,1 c/image (modèles
                    nudity-2.1 + gore).
                    <br />
                    <strong>Repère :</strong> 1 c/MAU/mois = 10 images
                    modérées par utilisateur actif/mois.
                  </>
                }
              />
              <NumberRow
                label="Coût emails par MAU / mois"
                value={inputs.emailCostPerMauCents}
                onChange={(v) => update("emailCostPerMauCents", v)}
                hint="Resend gratuit jusqu'à 3000/mois, ensuite ~0,04c/email."
                info={
                  <>
                    Resend : 3000 emails/mois gratuits (plan Free), puis
                    ~0,04 c/email au-delà (plan Pro 20 $/mois pour 50k).
                    <br />
                    À 0 c tant que tu restes sous le quota gratuit. Mets ~1c
                    si tu prévois beaucoup d&apos;emails (campagnes, notifs).
                  </>
                }
              />
              <NumberRow
                label="Coût bandwidth voice par premium / mois"
                value={inputs.voiceBandwidthCostPerPremiumCents}
                onChange={(v) =>
                  update("voiceBandwidthCostPerPremiumCents", v)
                }
                hint="VPS LiveKit. Inclus dans le forfait jusqu'à saturation."
                info={
                  <>
                    Coût marginal de la bande passante voice consommée par
                    premium et par mois. <strong>0 c</strong> tant que tu ne
                    satures pas la BP du VPS Hostinger (forfait fixe, BP
                    incluse). Au-delà = upgrade nécessaire (passage à
                    KVM4 ou Cloud Startup).
                  </>
                }
              />
              <NumberRow
                label="Coût storage par MAU / mois"
                value={inputs.storageCostPerMauCents}
                onChange={(v) => update("storageCostPerMauCents", v)}
                hint="Covers / avatars. Inclus dans Supabase Pro jusqu'à 100GB."
                info={
                  <>
                    Stockage Supabase (covers presets, avatars, bannières).
                    Free : 1 GB inclus. Pro : 100 GB inclus, puis 0,021 $/GB.
                    <br />
                    À 0 c tant que tu es sous quota. Mets ~0,5 c quand tu
                    passes la barre des 100 GB.
                  </>
                }
              />
            </Section>

            <Section title="Revenus publicité (AdSense)">
              <NumberRow
                label="RPM (€ pour 1000 impressions)"
                value={inputs.adsenseRpmEur}
                onChange={(v) => update("adsenseRpmEur", v)}
                step={0.1}
                hint="Gaming/social FR : 0,30 → 1 €. À ajuster selon ton historique."
                info={
                  <>
                    Revenue Per Mille = ce que Google AdSense te paie pour
                    1000 impressions affichées. Très variable selon le
                    marché et la qualité du trafic.
                    <br />
                    <strong>Repères France :</strong> gaming/social = 0,30 à
                    1 €, finance = 5-15 €, B2B = 10-30 €. À remplacer par ta
                    vraie valeur via le dashboard AdSense.
                  </>
                }
              />
              <NumberRow
                label="Pages vues par utilisateur free / mois"
                value={inputs.pageViewsPerFreeUser}
                onChange={(v) => update("pageViewsPerFreeUser", v)}
                step={5}
                info={
                  <>
                    Nombre de pages distinctes qu&apos;un free actif visite
                    par mois en moyenne. Trouvable dans PostHog (event
                    $pageview / nb users).
                    <br />
                    <strong>Repères :</strong> 30 = ~1 page/jour
                    (occasionnel), 100 = utilisateur engagé, 300 = power user.
                  </>
                }
              />
              <NumberRow
                label="Slots pub par page (moyenne)"
                value={inputs.adSlotsPerPage}
                onChange={(v) => update("adSlotsPerPage", v)}
                step={1}
                info={
                  <>
                    Nombre moyen de blocs publicitaires affichés par page
                    (compte tes <code>&lt;AdSlot /&gt;</code> dans le code).
                    <br />
                    <strong>Trade-off :</strong> ↑ slots = ↑ revenus mais ↓
                    UX et risque de rejet AdSense. 2-3 est un bon équilibre.
                  </>
                }
              />
              <SliderRow
                label="% de free qui voient la pub (consentement RGPD)"
                value={inputs.adsConsentPct}
                onChange={(v) => update("adsConsentPct", v)}
                min={0}
                max={100}
                suffix="%"
                info={
                  <>
                    Portion d&apos;utilisateurs qui acceptent les cookies
                    pub via le bandeau RGPD. En EU, beaucoup refusent.
                    <br />
                    <strong>Repères :</strong> 60% est typique (40% refusent
                    ou ne se prononcent pas). Sans consentement, AdSense
                    affiche des pubs non personnalisées au RPM ~3-5× plus
                    bas, ou rien.
                  </>
                }
              />
            </Section>

            <Section title="Coûts fixes (paliers infra)">
              <SelectRow
                label="Plan Vercel"
                value={inputs.vercelPlan}
                onChange={(v) => update("vercelPlan", v as VercelPlan)}
                options={Object.entries(getVercelPlans()).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
                info={
                  <>
                    Hébergement Next.js. <strong>Hobby</strong> : gratuit
                    mais limité à 100 GB BP, 100k invocations, pas
                    d&apos;usage commercial. <strong>Pro</strong> : 20 $/mois
                    inclut 1 TB BP + 1 M invocations + usage commercial OK.
                    <br />
                    Le simulateur lève une alerte jaune si tu dépasses la
                    capacité (à monter d&apos;un palier).
                  </>
                }
              />
              <SelectRow
                label="Plan Supabase"
                value={inputs.supabasePlan}
                onChange={(v) => update("supabasePlan", v as SupabasePlan)}
                options={Object.entries(getSupabasePlans()).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
                info={
                  <>
                    DB + Auth + Storage. <strong>Free</strong> : 50k MAU
                    auth, 500 MB DB, 1 GB storage, mise en pause après 7j
                    sans activité. <strong>Pro</strong> : 25 $/mois pour
                    100k MAU, 8 GB DB, 100 GB storage, pas de pause.
                    <br />
                    Si tu vises &gt; 50k MAU, le passage en Pro est
                    obligatoire (l&apos;auth est bloquée sinon).
                  </>
                }
              />
              <SelectRow
                label="VPS Hostinger (LiveKit)"
                value={inputs.hostingerVpsPlan}
                onChange={(v) => update("hostingerVpsPlan", v as HostingerPlan)}
                options={Object.entries(getHostingerPlans()).map(
                  ([k, v]) => ({ value: k, label: v.label })
                )}
                info={
                  <>
                    Serveur LiveKit auto-hébergé pour le voice. Capacité
                    estimée (participants vocaux simultanés au pic) :
                    KVM 2 ≈ 50, KVM 4 ≈ 120, KVM 8 ≈ 300, Cloud ≈ 600.
                    <br />
                    <strong>Tarifs :</strong> renouvellement (hors promo
                    de lancement). Si tu n&apos;utilises pas le voice,
                    KVM 2 reste suffisant ad vitam.
                  </>
                }
              />
              <NumberRow
                label="Autres fixes (centimes EUR/mois)"
                value={inputs.otherFixedCostsCents}
                onChange={(v) => update("otherFixedCostsCents", v)}
                hint="Domaine, comptable SASU, sentry, etc."
                info={
                  <>
                    Tout ce qui n&apos;est pas couvert par les paliers
                    ci-dessus :
                    <br />· Domaine .fr ≈ 100 c (1 €/mois au prorata)
                    <br />· Comptable SASU ≈ 5000 c (50 €/mois)
                    <br />· Sentry / monitoring ≈ 0-2600 c
                    <br />· PostHog Pro si dépassement quota gratuit
                    <br />· Assurance pro RC, etc.
                  </>
                }
              />
            </Section>
          </div>

          {/* ─── Résultats (sticky sur desktop) ────────────────────────── */}
          <aside className="lg:sticky lg:top-4 self-start space-y-4">
            <ResultsPanel outputs={outputs} />
          </aside>
        </div>
      </div>
    </main>
  );
}

// ─── Sous-composants UI ─────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-2xl bg-surface-900/60 border border-surface-800/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800/40"
      >
        <span className="font-bold text-sm uppercase tracking-wide text-surface-200">
          {title}
        </span>
        <span className="text-surface-500 text-xs">
          {open ? "Réduire" : "Déplier"}
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </section>
  );
}

function InfoIcon({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Plus d'informations"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="inline-flex w-4 h-4 rounded-full bg-surface-700 hover:bg-surface-600 text-surface-200 text-[10px] font-bold items-center justify-center shrink-0"
      >
        i
      </button>
      {open && (
        <span className="absolute z-50 left-5 top-0 w-64 max-w-[80vw] p-2.5 rounded-lg bg-surface-950 border border-surface-700 text-[11px] text-surface-200 leading-snug shadow-xl">
          {children}
        </span>
      )}
    </span>
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
        className="px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm w-full md:max-w-[200px]"
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
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-surface-400">
          <LabelWithInfo label={label} info={info} />
        </label>
        <span className="text-xs text-white font-medium tabular-nums">
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
        className="px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/40 text-white text-sm w-full md:max-w-[300px]"
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

function ResultsPanel({
  outputs,
}: {
  outputs: ReturnType<typeof simulate>;
}) {
  const margeColor =
    outputs.grossMarginCents >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-4">
      {/* KPI Hero */}
      <div className="rounded-2xl bg-surface-900/80 border border-surface-800/60 p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-surface-400">
          Résultat mensuel simulé
        </p>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${margeColor}`}>
            {fmtEur(outputs.grossMarginCents)}
          </span>
          <span className="text-xs text-surface-400">
            ({outputs.marginPct.toFixed(1)}% marge)
          </span>
        </div>
        <p className="text-xs text-surface-500">
          {outputs.isProfitable ? "Profitable" : "Non rentable"} ·{" "}
          {fmtNumber(outputs.mau)} MAU · {fmtNumber(outputs.premiumActive)}{" "}
          premium ({fmtNumber(outputs.affiliateAcquired)} via affilié)
        </p>
      </div>

      {/* Composition */}
      <Card title="Audience">
        <Line label="Total comptes" v={fmtNumber(outputs.mau + outputs.freeActive)} />
        <Line label="MAU" v={fmtNumber(outputs.mau)} />
        <Line label="Free actifs" v={fmtNumber(outputs.freeActive)} />
        <Line label="Premium actifs" v={fmtNumber(outputs.premiumActive)} highlight />
        <Line label="· monthly" v={fmtNumber(outputs.monthlyCount)} small />
        <Line label="· yearly" v={fmtNumber(outputs.yearlyCount)} small />
        <Line label="· lifetime cumulés" v={fmtNumber(outputs.lifetimeCount)} small />
        <Line label="Nouveaux lifetime ce mois" v={fmtNumber(outputs.newLifetimeThisMonth)} small />
      </Card>

      {/* Revenus */}
      <Card title="Revenus mensuels">
        <Line label="MRR Monthly" v={fmtEur(outputs.mrrFromMonthlyCents)} />
        <Line label="MRR Yearly (annualisé/12)" v={fmtEur(outputs.mrrFromYearlyCents)} />
        <Line label="Lifetime ce mois" v={fmtEur(outputs.lifetimeOneShotCents)} />
        <Line label="Total Lemon brut" v={fmtEur(outputs.lemonGrossRevenueCents)} highlight />
        <Line label="− Frais MoR (5% + 0,46 €)" v={`-${fmtEur(outputs.lemonFeesCents)}`} negative />
        <Line label="− Commissions affiliés" v={`-${fmtEur(outputs.affiliateCommissionsCents)}`} negative />
        <Line label="+ AdSense" v={fmtEur(outputs.adsenseRevenueCents)} />
        <Line label="Net total" v={fmtEur(outputs.totalNetRevenueCents)} highlight positive />
      </Card>

      {/* Coûts variables */}
      <Card title="Coûts variables">
        <Line label="Navi (OpenAI)" v={fmtEur(outputs.naviCostCents)} />
        <Line label="Modération (Sightengine)" v={fmtEur(outputs.moderationCostCents)} />
        <Line label="Emails (Resend)" v={fmtEur(outputs.emailCostCents)} />
        <Line label="Voice bandwidth" v={fmtEur(outputs.voiceBandwidthCostCents)} />
        <Line label="Storage" v={fmtEur(outputs.storageCostCents)} />
        <Line label="Total variables" v={fmtEur(outputs.variableCostsTotalCents)} highlight />
      </Card>

      {/* Coûts fixes */}
      <Card title="Coûts fixes">
        <Line label="Vercel" v={fmtEur(outputs.vercelCostCents)} />
        <Line label="Supabase" v={fmtEur(outputs.supabaseCostCents)} />
        <Line label="Hostinger VPS (voice)" v={fmtEur(outputs.hostingerCostCents)} />
        <Line label="Autres" v={fmtEur(outputs.otherFixedCostsCents)} />
        <Line label="Total fixes" v={fmtEur(outputs.fixedCostsTotalCents)} highlight />
      </Card>

      {/* Synthèse */}
      <Card title="Synthèse">
        <Line label="Total coûts" v={fmtEur(outputs.totalCostsCents)} negative />
        <Line label="Marge brute" v={fmtEur(outputs.grossMarginCents)} highlight positive={outputs.grossMarginCents >= 0} negative={outputs.grossMarginCents < 0} />
        <Line label="ARPU (par MAU)" v={fmtEur(outputs.arpuCents)} small />
        <Line label="ARPPU (par premium)" v={fmtEur(outputs.arppuCents)} small />
        <Line label="Coût/MAU" v={fmtEur(outputs.costPerMauCents)} small />
        <Line label="Coût/premium" v={fmtEur(outputs.costPerPremiumCents)} small />
      </Card>

      {/* Warnings */}
      {outputs.warnings.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-amber-400 font-bold">
            Alertes paliers
          </p>
          {outputs.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-200/90">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
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
    <div className="rounded-2xl bg-surface-900/60 border border-surface-800/60 p-4">
      <p className="text-[10px] uppercase tracking-wider text-surface-400 mb-2">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
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
        className={`${small ? "text-[11px]" : "text-sm"} ${valColor} ${highlight ? "font-bold" : "font-medium"} tabular-nums`}
      >
        {v}
      </span>
    </div>
  );
}
