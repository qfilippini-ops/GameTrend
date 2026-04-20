import { getTranslations } from "next-intl/server";
import Header from "@/components/layout/Header";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <div className="bg-surface-950 min-h-screen">
      <Header title={t("layoutTitle")} backHref="/profile" />
      <div className="max-w-2xl mx-auto px-5 py-6 pb-16 prose prose-invert prose-sm max-w-none">
        <style>{`
          .prose h1 { font-size: 1.5rem; font-weight: 900; font-family: var(--font-display); margin-bottom: 0.25rem; }
          .prose h2 { font-size: 1rem; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2rem; margin-bottom: 0.75rem; }
          .prose p, .prose li { color: #d4d4d8; line-height: 1.7; font-size: 0.875rem; }
          .prose strong { color: #fafafa; }
          .prose a { color: #7c3aed; }
          .prose ul { padding-left: 1.25rem; }
          .prose hr { border-color: #27272a; margin: 1.5rem 0; }
        `}</style>
        {t("frenchOnlyNotice") && (
          <p className="text-amber-400/80 text-xs italic border border-amber-700/30 bg-amber-950/20 rounded-lg px-3 py-2 mb-4 not-prose">
            {t("frenchOnlyNotice")}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
