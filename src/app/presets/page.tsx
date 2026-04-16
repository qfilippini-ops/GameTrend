import Header from "@/components/layout/Header";
import Link from "next/link";
import PresetList from "@/components/presets/PresetList";

export default function PresetsPage() {
  return (
    <div>
      <Header
        title="Bibliothèque"
        actions={
          <Link
            href="/presets/new"
            className="hidden sm:flex bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-brand-500 transition-colors"
          >
            + Créer
          </Link>
        }
      />
      <div className="px-4 pt-4 pb-8">
        <PresetList />
      </div>
    </div>
  );
}
