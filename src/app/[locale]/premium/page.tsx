import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import PremiumPricing from "@/components/premium/PremiumPricing";
import Header from "@/components/layout/Header";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "premium" });
  return {
    title: `${t("title")} — GameTrend`,
    description: t("subtitle"),
  };
}

export default async function PremiumPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "premium" });

  // Récupère le compteur lifetime côté serveur.
  // PostgREST peut renvoyer le scalar brut (1), un objet ({count_lifetime_taken: 1}),
  // ou wrappé dans un array selon la version du client. On normalise défensivement.
  const publicClient = createPublicClient();
  const { data: rpcRaw, error: rpcErr } = await publicClient.rpc("count_lifetime_taken");
  if (rpcErr) {
    console.error("[premium-page] count_lifetime_taken error", rpcErr);
  }
  const lifetimeTaken = extractCount(rpcRaw);
  const lifetimeRemaining = Math.max(0, 100 - lifetimeTaken);

  // Récupère le profil pour savoir si user éligible lifetime
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let lifetimeEligible = false;
  let currentStatus = "free";
  if (user && !user.is_anonymous) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("lifetime_eligible, subscription_status")
      .eq("id", user.id)
      .maybeSingle();
    lifetimeEligible = profile?.lifetime_eligible ?? false;
    currentStatus = profile?.subscription_status ?? "free";
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header title={t("title")} backHref="/profile" />

      <PremiumPricing
        lifetimeRemaining={lifetimeRemaining}
        lifetimeEligible={lifetimeEligible}
        currentStatus={currentStatus}
        isAuthenticated={Boolean(user) && !user?.is_anonymous}
      />
    </div>
  );
}

/**
 * Normalise la valeur retournée par count_lifetime_taken().
 *
 * PostgREST + supabase-js renvoient le résultat sous différentes formes selon
 * le typage de la fonction et la version du client :
 *   - number brut       : 1
 *   - string            : "1"
 *   - objet wrapping    : { count_lifetime_taken: 1 }
 *   - array de scalars  : [1]
 *   - array d'objets    : [{ count_lifetime_taken: 1 }]
 *
 * On tente toutes les formes connues et on tombe sur 0 si rien ne ressemble
 * à un nombre exploitable.
 */
function extractCount(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (Array.isArray(raw)) {
    return raw.length > 0 ? extractCount(raw[0]) : 0;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate =
      obj.count_lifetime_taken ?? obj.count ?? Object.values(obj)[0];
    return extractCount(candidate);
  }
  return 0;
}
