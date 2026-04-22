/**
 * Briques génériques pour les jeux online de GameTrend.
 *
 * Chaque jeu (GhostWord, Blind Rank, …) compose ces briques pour
 * implémenter son mode online. Cela garantit la maintenabilité :
 * une modification dans le chat ou la salle d'attente bénéficie
 * automatiquement à tous les jeux.
 *
 * Ne dépend d'aucun jeu spécifique — les libellés sont passés en props
 * pour rester découplé d'un namespace i18n particulier.
 */

export { default as RoomShell } from "./components/RoomShell";
export type { RoomPhaseContext, RoomShellLabels } from "./components/RoomShell";

export { default as RoomWaitingShell } from "./components/RoomWaitingShell";
export type { RoomWaitingShellLabels } from "./components/RoomWaitingShell";

export { default as OnlineLobbyShell } from "./components/OnlineLobbyShell";
export type { OnlineLobbyShellLabels } from "./components/OnlineLobbyShell";

export { default as RoomChat } from "./components/RoomChat";
export type { RoomChatLabels } from "./components/RoomChat";

export { default as JoinScreen } from "./components/JoinScreen";
export type { JoinScreenLabels } from "./components/JoinScreen";

export { default as RoomGameButtons } from "./components/RoomGameButtons";
export type { RoomGameButtonsLabels } from "./components/RoomGameButtons";

export { useRoomChannel } from "./hooks/useRoomChannel";
export type { UseRoomChannelResult } from "./hooks/useRoomChannel";
