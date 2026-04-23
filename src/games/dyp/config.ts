import type { GameMeta } from "@/types/games";

export const DYP_META: GameMeta = {
  id: "dyp",
  name: "DYP",
  description:
    "Un tournoi bracket où tu élimines en duel jusqu'au grand gagnant. Quel sera ton préféré absolu ?",
  icon: "⚡",
  minPlayers: 1,
  maxPlayers: 16,
  estimatedDuration: "5-15 min",
  tags: ["solo", "online", "choix", "bracket", "tournoi"],
};
