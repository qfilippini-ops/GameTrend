import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import { Link } from "@/i18n/navigation";
import PresetList from "@/components/presets/PresetList";
import { getTranslations } from "next-intl/server";
import { SITE_URL, LOCALES, DEFAULT_LOCALE } from "@/lib/seo/sitemap";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "presets.list" });
  const title = t("seoTitle");
  const description = t("seoDescription");
  const path = `/${params.locale}/presets`;
  const languages = Object.fromEntries(
    LOCALES.map((loc) => [loc, `${SITE_URL}/${loc}/presets`]),
  ) as Record<string, string>;
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}/presets`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}${path}`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PresetsPage() {
  const t = await getTranslations("presets.list");
  return (
    <div>
      <Header
        title={t("title")}
        actions={
          <Link
            href="/presets/new"
            className="hidden sm:flex bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-brand-500 transition-colors"
          >
            + {t("create")}
          </Link>
        }
      />
      <article className="px-4 pt-4 pb-8">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {t("h1")}
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-2xl">{t("intro")}</p>
        </header>
        <section aria-label={t("title")}>
          <PresetList />
        </section>
      </article>
    </div>
  );
}
