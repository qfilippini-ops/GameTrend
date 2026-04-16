# 👻 GameTrend

> Le hub de jeux sociaux viraux — Progressive Web App communautaire

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)

---

## Vision

GameTrend centralise des mécaniques de jeux de soirée (Undercover, Quizz, Enchères) dans une interface ultra-rapide, installable sans passer par les stores, et dont le contenu est **entièrement généré par la communauté** via un système de presets personnalisables.

## Jeux disponibles

| Jeu | Statut | Joueurs | Durée |
|-----|--------|---------|-------|
| 👻 GhostWord | ✅ MVP | 3–12 | 10–30 min |
| 🧩 Quiz Battle | 🔜 Bientôt | 2–8 | 15–45 min |
| 🏷️ Enchères | 🔜 Bientôt | 3–10 | 20–60 min |

---

## Stack Technique

- **Framework** : [Next.js 14](https://nextjs.org) — App Router
- **Language** : TypeScript strict
- **Style** : Tailwind CSS + Dark Mode natif
- **Animations** : Framer Motion
- **Backend** : [Supabase](https://supabase.com) (Auth + PostgreSQL + Storage)
- **PWA** : `@ducanh2912/next-pwa` + Service Worker
- **Déploiement** : Vercel

---

## Démarrage rapide

### Prérequis
- Node.js 18+
- Un projet [Supabase](https://supabase.com) (gratuit)

### Installation

```bash
# 1. Cloner le repo
git clone https://github.com/ton-username/gametrend.git
cd gametrend

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local
# Remplis NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. Initialiser la base de données Supabase
# Copie-colle le contenu de supabase/schema.sql dans le SQL Editor de Supabase

# 5. Lancer en développement
npm run dev
```

L'app tourne sur [http://localhost:3000](http://localhost:3000)

---

## Structure du projet

```
gametrend/
├── src/
│   ├── app/                    # Pages Next.js (App Router)
│   │   ├── games/ghostword/    # Lobby + gameplay GhostWord
│   │   ├── presets/            # Bibliothèque + création + détail
│   │   ├── profile/            # Profil joueur
│   │   └── auth/               # Login, Signup, Callback
│   ├── components/
│   │   ├── ui/                 # Boutons, Cartes, Modales, Avatar, Badge
│   │   ├── layout/             # Header, BottomNav
│   │   └── presets/            # PresetCard, PresetForm
│   ├── games/
│   │   └── ghostword/          # Logique + composants de gameplay
│   │       ├── engine.ts       # Algorithme de distribution des rôles
│   │       ├── config.ts       # Métadonnées du jeu
│   │       └── components/     # VeilScreen, RevealScreen, VoteScreen, ResultScreen
│   ├── hooks/                  # useAuth, useVibration
│   ├── lib/
│   │   ├── supabase/           # Client browser + server
│   │   └── utils.ts            # Helpers (cn, vibrate, shuffle…)
│   └── types/                  # Types TypeScript (database, games)
├── public/
│   ├── manifest.json           # PWA manifest
│   └── icons/                  # Icônes SVG
└── supabase/
    └── schema.sql              # Schéma PostgreSQL complet avec RLS
```

---

## Ajouter un nouveau jeu

Consulte le guide [CONTRIBUTING.md](CONTRIBUTING.md#ajouter-un-jeu) pour un walkthrough complet en moins de 48h.

En résumé :

1. Crée `src/games/TON_JEU/` avec `engine.ts`, `config.ts`, `types.ts`
2. Ajoute les pages dans `src/app/games/TON_JEU/`
3. Ajoute le `game_type` dans le schéma SQL (contrainte `game_type_valid`)
4. Référence le jeu dans `src/app/page.tsx`

Le champ `config` JSONB dans la table `presets` accueille n'importe quelle structure sans migration.

---

## Déploiement Vercel

```bash
# Connecte ton repo GitHub à Vercel
# Configure les variables d'environnement dans le dashboard Vercel :
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - NEXT_PUBLIC_APP_URL (ton domaine Vercel)
```

---

## Licence

MIT — Voir [LICENSE](LICENSE)
