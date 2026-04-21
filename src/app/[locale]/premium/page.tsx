import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PremiumPricing from "@/components/premium/PremiumPricing";
import Header from "@/components/layout/Header";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

  // Compteur lifetime — on utilise le client service_role pour bypass entièrement
  // la RLS (sans dépendre du SECURITY DEFINER de la RPC, qui s'est révélé fragile
  // sur Supabase Cloud à cause de l'owner non-superuser des fonctions).
  // C'est un simple count public, aucune donnée sensible n'est leakée.
  const admin = createAdminClient();
  const { count: lifetimeCountRaw, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("subscription_status", "lifetime");
  if (countErr) {
    console.error("[premium-page] lifetime count failed", countErr);
  }
  const lifetimeTaken = lifetimeCountRaw ?? 0;
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

