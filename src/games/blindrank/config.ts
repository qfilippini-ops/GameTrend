import type { GameMeta } from "@/types/games";

export const BLINDRANK_META: GameMeta = {
  id: "blindrank",
  name: "Blind Rank",
  description:
    "Une carte aléatoire apparaît à chaque tour. Place-la au rang de ton choix sans connaitre la suite.",
  icon: "🎴",
  minPlayers: 1,
  maxPlayers: 1,
  estimatedDuration: "3-10 min",
  tags: ["Solo/Online", "classement", "stratégie", "intuition"],
};
