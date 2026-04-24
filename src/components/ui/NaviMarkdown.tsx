"use client";

// Rendu markdown léger pour les verdicts de Navi (arbitre IA).
// On limite volontairement les éléments supportés visuellement (pas de h1/h2
// énormes, pas d'images) et on garde un style compact qui colle au panel
// violet de Navi, que ce soit dans la page résultat ou dans le feed.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface NaviMarkdownProps {
  content: string;
  // Le verdict s'affiche dans deux contextes (page résultat / feed) avec des
  // tailles de texte différentes ; on laisse l'appelant fixer la taille.
  className?: string;
}

export function NaviMarkdown({ content, className = "" }: NaviMarkdownProps) {
  return (
    <div className={`navi-md text-violet-100 leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Les titres markdown éventuels (### Équipe X) sont rendus comme
          // un sous-titre coloré, pas comme un H3 énorme qui casserait le
          // panel.
          h1: ({ children }) => (
            <p className="font-display font-bold text-violet-50 mt-3 first:mt-0">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="font-display font-bold text-violet-50 mt-3 first:mt-0">
              {children}
            </p>
          ),
          h3: ({ children }) => (
            <p className="font-display font-bold text-violet-50 mt-3 first:mt-0">
              {children}
            </p>
          ),
          h4: ({ children }) => (
            <p className="font-display font-bold text-violet-50 mt-3 first:mt-0">
              {children}
            </p>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 space-y-1 marker:text-violet-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 space-y-1 marker:text-violet-400">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-bold text-violet-50">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-violet-200">{children}</em>
          ),
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-violet-900/40 text-violet-100 text-[0.9em]">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fuchsia-300 underline underline-offset-2 hover:text-fuchsia-200"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-violet-800/50" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-violet-500/60 pl-3 italic text-violet-200 my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
