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

  // Récupère le compteur lifetime côté serveur (cache court)
  const publicClient = createPublicClient();
  const { data: lifetimeCount } = await publicClient.rpc("count_lifetime_taken");
  const lifetimeTaken = typeof lifetimeCount === "number" ? lifetimeCount : 0;
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
