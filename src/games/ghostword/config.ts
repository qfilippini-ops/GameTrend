import type { GameMeta } from "@/types/games";

export const GHOSTWORD_META: GameMeta = {
  id: "ghostword",
  name: "GhostWord",
  description:
    "Un jeu d'Undercover intense où les Ombres cherchent à tromper les Initiés. Qui gardera son secret jusqu'à la fin ?",
  icon: "👻",
  minPlayers: 3,
  maxPlayers: 12,
  estimatedDuration: "10-30 min",
  tags: ["bluff", "Solo/Online", "déduction", "soirée"],
};
