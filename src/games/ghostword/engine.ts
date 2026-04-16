import { v4 as uuidv4 } from "uuid";
import { shuffleArray } from "@/lib/utils";
import type {
  GhostWordConfig,
  GhostWordGameState,
  GhostWordPlayer,
  GhostWordRole,
} from "@/types/games";

// Config par défaut — familles de mots proches (idéal pour l'Undercover)
// Chaque famille contient des mots du même thème mais suffisamment distincts
// pour que l'Ombre puisse se fondre sans trop de difficultés.
export const DEFAULT_CONFIG: GhostWordConfig = {
  families: [
    {
      id: "plage",
      name: "À la plage",
      words: [
        { id: "p1", name: "Parasol" },
        { id: "p2", name: "Serviette" },
        { id: "p3", name: "Sable" },
        { id: "p4", name: "Vague" },
        { id: "p5", name: "Bouée" },
        { id: "p6", name: "Maillot de bain" },
      ],
    },
    {
      id: "cuisine",
      name: "En cuisine",
      words: [
        { id: "c1", name: "Casserole" },
        { id: "c2", name: "Fouet" },
        { id: "c3", name: "Spatule" },
        { id: "c4", name: "Four" },
        { id: "c5", name: "Planche à découper" },
        { id: "c6", name: "Mixeur" },
      ],
    },
    {
      id: "sport-balle",
      name: "Sports de balle",
      words: [
        { id: "s1", name: "Football" },
        { id: "s2", name: "Rugby" },
        { id: "s3", name: "Basketball" },
        { id: "s4", name: "Volleyball" },
        { id: "s5", name: "Tennis" },
        { id: "s6", name: "Handball" },
      ],
    },
    {
      id: "animaux-ferme",
      name: "Animaux de ferme",
      words: [
        { id: "a1", name: "Vache" },
        { id: "a2", name: "Cochon" },
        { id: "a3", name: "Mouton" },
        { id: "a4", name: "Poule" },
        { id: "a5", name: "Cheval" },
        { id: "a6", name: "Canard" },
      ],
    },
    {
      id: "transports",
      name: "Transports",
      words: [
        { id: "t1", name: "Vélo" },
        { id: "t2", name: "Trottinette" },
        { id: "t3", name: "Moto" },
        { id: "t4", name: "Scooter" },
        { id: "t5", name: "Voiture" },
        { id: "t6", name: "Bus" },
      ],
    },
  ],
  roles: {
    initie: { name: "Initié" },
    ombre: { name: "Ombre" },
    vide: { name: "Le Vide" },
  },
};

export interface SetupOptions {
  playerNames: string[];
  config: GhostWordConfig;
  presetId?: string;
  /** Probabilité d'avoir l'Ombre (vs le Vide). Entre 0 et 100. Défaut : 90 */
  ombrePercent?: number;
  /** Nombre de tours de discussion avant chaque vote. Défaut : 2 */
  discussionTurnsPerRound?: number;
}

export function createGame(options: SetupOptions): GhostWordGameState {
  const {
    playerNames,
    config,
    presetId,
    ombrePercent = 90,
    discussionTurnsPerRound = 2,
  } = options;
  const count = playerNames.length;

  if (count < 3) throw new Error("Il faut au moins 3 joueurs.");
  if (count > 12) throw new Error("Maximum 12 joueurs.");

  // Toujours 1 seul rôle spécial, probabilité configurable
  const isVide = Math.random() * 100 >= ombrePercent;
  const specialRole: GhostWordRole = isVide ? "vide" : "ombre";

  const roles: GhostWordRole[] = [
    ...Array(count - 1).fill("initie" as GhostWordRole),
    specialRole,
  ];

  const shuffledRoles = shuffleArray(roles);

  // Tire une famille au hasard (à égalité de probabilité)
  const family = config.families[Math.floor(Math.random() * config.families.length)];

  // Mot des Initiés : tiré aléatoirement dans la famille
  const initiéIdx = Math.floor(Math.random() * family.words.length);
  const initiéWord = family.words[initiéIdx];

  // Mot de l'Ombre : un MOT DIFFÉRENT de la même famille
  // Si la famille n'a qu'un seul mot, l'Ombre a le même (edge case)
  const ombrePool = family.words.filter((_, i) => i !== initiéIdx);
  const ombreWord = ombrePool.length > 0
    ? ombrePool[Math.floor(Math.random() * ombrePool.length)]
    : initiéWord;

  const players: GhostWordPlayer[] = playerNames.map((name, i) => {
    const role = shuffledRoles[i];

    if (role === "vide") {
      return { id: uuidv4(), name, role, word: null, wordImageUrl: undefined, isEliminated: false, hasRevealed: false };
    }

    const assigned = role === "ombre" ? ombreWord : initiéWord;
    return {
      id: uuidv4(),
      name,
      role,
      word: assigned.name,
      wordImageUrl: assigned.imageUrl ?? undefined,
      isEliminated: false,
      hasRevealed: false,
    };
  });

  return {
    phase: "veil",
    players: shuffleArray(players),
    currentPlayerIndex: 0,
    voteRound: 0,
    discussionTurn: 1,
    discussionTurnsPerRound,
    initialRevealDone: false,
    eliminatedThisRound: [],
    winner: null,
    presetId,
  };
}

// ─── Élimination ────────────────────────────────────────────────────────────

export function eliminatePlayer(
  state: GhostWordGameState,
  playerId: string
): GhostWordGameState {
  const updated = state.players.map((p) =>
    p.id === playerId ? { ...p, isEliminated: true } : p
  );
  const newState: GhostWordGameState = {
    ...state,
    players: updated,
    eliminatedThisRound: [...state.eliminatedThisRound, playerId],
  };
  return checkWinCondition(newState);
}

// ─── Condition de victoire ───────────────────────────────────────────────────
// La partie s'arrête dès qu'il reste 2 joueurs ou moins.
// - Si l'Ombre ou le Vide est encore en vie → il gagne
// - Si seulement des Initiés restent → les Initiés gagnent

export function checkWinCondition(
  state: GhostWordGameState
): GhostWordGameState {
  const alive = state.players.filter((p) => !p.isEliminated);

  if (alive.length > 2) return state;

  // 2 joueurs ou moins → fin de partie
  const special = alive.find((p) => p.role === "ombre" || p.role === "vide");
  const winner: GhostWordRole = special ? special.role : "initie";

  return { ...state, winner, phase: "result" };
}

// ─── Transitions de phase ────────────────────────────────────────────────────

export function nextPhase(state: GhostWordGameState): GhostWordGameState {
  switch (state.phase) {

    // Un joueur vient de mémoriser son mot → avancer au suivant ou discussion
    // La phase "veil" englobe à la fois l'écran de voile ET la révélation du mot
    // (la révélation est gérée localement dans le composant via showingReveal)
    case "veil": {
      const nextIndex = findNextAlivePlayer(state);

      if (nextIndex !== -1) {
        // Prochain joueur — reste en phase "veil"
        return { ...state, currentPlayerIndex: nextIndex };
      }

      // Tous les joueurs ont vu leur mot → discussion
      return {
        ...state,
        phase: "discussion",
        initialRevealDone: true,
        discussionTurn: 1,
      };
    }

    // Fin d'un tour de discussion
    case "discussion": {
      if (state.discussionTurn < state.discussionTurnsPerRound) {
        return { ...state, discussionTurn: state.discussionTurn + 1 };
      }
      // Dernier tour de discussion → Vote
      return { ...state, phase: "vote" };
    }

    // Après le vote (appel depuis play/page.tsx une fois l'élimination faite)
    case "vote":
      return {
        ...state,
        phase: "discussion",
        voteRound: state.voteRound + 1,
        discussionTurn: 1,
        eliminatedThisRound: [],
        currentPlayerIndex: findFirstAliveIndex(state),
      };

    default:
      return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findNextAlivePlayer(state: GhostWordGameState): number {
  const { players, currentPlayerIndex } = state;
  for (let i = currentPlayerIndex + 1; i < players.length; i++) {
    if (!players[i].isEliminated) return i;
  }
  return -1;
}

function findFirstAliveIndex(state: GhostWordGameState): number {
  return state.players.findIndex((p) => !p.isEliminated);
}

export function getAlivePlayers(state: GhostWordGameState): GhostWordPlayer[] {
  return state.players.filter((p) => !p.isEliminated);
}

export function getFactions(state: GhostWordGameState): GhostWordRole[] {
  const alive = getAlivePlayers(state);
  const roles = alive.map((p) => p.role);
  return roles.filter((r, i) => roles.indexOf(r) === i);
}
