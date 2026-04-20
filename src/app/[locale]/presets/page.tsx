import Header from "@/components/layout/Header";
import { Link } from "@/i18n/navigation";
import PresetList from "@/components/presets/PresetList";
import { getTranslations } from "next-intl/server";

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
      <div className="px-4 pt-4 pb-8">
        <PresetList />
      </div>
    </div>
  );
}
