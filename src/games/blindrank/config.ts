import type { GameMeta } from "@/types/games";

export const BLINDRANK_META: GameMeta = {
  id: "blindrank",
  name: "Blind Rank",
  description:
    "Une carte mystère apparaît à chaque tour. Place-la au bon rang dans ton classement avant de découvrir la suivante.",
  icon: "🎴",
  minPlayers: 1,
  maxPlayers: 1,
  estimatedDuration: "3-10 min",
  tags: ["solo", "classement", "stratégie", "intuition"],
};
