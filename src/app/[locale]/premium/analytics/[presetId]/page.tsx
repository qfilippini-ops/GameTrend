import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import PresetAnalyticsView from "@/components/premium/PresetAnalyticsView";

export const dynamic = "force-dynamic";

export default async function PresetAnalyticsPage({
  params: { locale, presetId },
}: {
  params: { locale: string; presetId: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "premium.analytics" });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect(`/${locale}/auth/login?redirect=/premium/analytics/${presetId}`);
  }

  const { data: preset } = await supabase
    .from("presets")
    .select("id, name, author_id")
    .eq("id", presetId)
    .maybeSingle();

  if (!preset || preset.author_id !== user.id) {
    redirect(`/${locale}/profile`);
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header title={t("title")} backHref="/profile" />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h2 className="text-xl font-display font-bold text-white mb-1 truncate">
          {preset.name}
        </h2>
        <p className="text-surface-500 text-xs mb-5">{t("subtitle")}</p>
        <PresetAnalyticsView presetId={presetId} />
      </main>
    </div>
  );
}
