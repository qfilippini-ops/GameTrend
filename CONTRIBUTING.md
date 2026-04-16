# Guide de contribution — GameTrend

Merci de vouloir contribuer ! Ce guide explique comment enrichir la plateforme.

---

## Prérequis

- Node.js 18+, npm
- Connaissances de base : TypeScript, React, Next.js App Router
- Un fork du repo + branche dédiée

---

## Ajouter un jeu

Voici le walkthrough pour ajouter un nouveau jeu en moins de 48h, en s'appuyant sur l'architecture existante.

### Étape 1 — Définir les types (`src/types/games.ts`)

Ajoute les interfaces propres à ton jeu dans `src/types/games.ts`.

```typescript
// Exemple pour un jeu "Quiz"
export interface QuizQuestion {
  question: string;
  answers: string[];
  correctIndex: number;
}

export interface QuizConfig {
  questions: QuizQuestion[];
  timePerQuestion: number;
}
```

### Étape 2 — Créer la logique (`src/games/TON_JEU/`)

```
src/games/ton_jeu/
├── engine.ts       # Logique pure, sans dépendance React
├── config.ts       # GameMeta (nom, icône, joueurs min/max…)
└── components/     # Composants React du gameplay
```

`engine.ts` doit exporter une fonction `createGame()` et des fonctions de transition d'état pures (sans effets de bord).

### Étape 3 — Créer les pages (`src/app/games/TON_JEU/`)

```
src/app/games/ton_jeu/
├── page.tsx        # Lobby (configuration + joueurs)
└── play/
    └── page.tsx    # Gameplay principal
```

### Étape 4 — Mettre à jour le schéma Supabase

Dans `supabase/schema.sql`, ajoute ton `game_type` à la contrainte :

```sql
constraint game_type_valid check (game_type in ('ghostword', 'quiz', 'ton_jeu'))
```

### Étape 5 — Référencer le jeu sur la home

Dans `src/app/page.tsx`, ajoute une entrée dans le tableau `GAMES`.

---

## Ajouter des mots à GhostWord

Pour enrichir le dictionnaire par défaut de GhostWord, modifie `src/games/ghostword/engine.ts` dans le tableau `DEFAULT_CONFIG.words`.

Chaque paire doit respecter ces règles :
- Les deux mots doivent appartenir à la même catégorie sémantique
- Ils ne doivent **pas** être synonymes exacts (trop facile pour l'Ombre)
- Ils ne doivent **pas** être trop différents (trop facile pour les Initiés)

---

## Conventions de code

- **TypeScript strict** : pas de `any` sauf justification explicite
- **Composants** : `PascalCase.tsx`, fonctions `camelCase`
- **Pas de commentaires évidents** — le code se suffit
- **Tailwind uniquement** pour les styles — pas de CSS inline
- **Framer Motion** pour toutes les animations (pas de `transition` CSS isolé)

---

## Ouvrir une PR

1. Fork → branche `feat/nom-du-jeu` ou `fix/description`
2. Commits atomiques en français ou anglais
3. Description PR : contexte, screenshots mobile, edge cases testés
4. Label `game` pour les nouveaux jeux, `fix` pour les corrections, `preset-engine` pour le moteur de presets

---

## Questions ?

Ouvre une issue avec le label `question`. La communauté répond en général sous 48h.
