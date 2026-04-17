import Header from "@/components/layout/Header";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-950 min-h-screen">
      <Header title="Informations légales" backHref="/profile" />
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
        {children}
      </div>
    </div>
  );
}
