// Capacité d'un lobby selon le statut d'abonnement.
// Source de vérité côté SQL : public.compute_max_players(uid). Cette fonction
// TS est un miroir pour pouvoir afficher la capacité en UI sans aller-retour
// réseau supplémentaire. Si jamais on désaligne les valeurs, l'arbitre reste
// SQL (trigger BEFORE INSERT sur game_rooms).

export const FREE_LOBBY_CAPACITY = 4;
export const PREMIUM_LOBBY_CAPACITY = 16;

const PREMIUM_STATUSES = new Set(["trialing", "active", "lifetime"]);

export function isPremiumStatus(status: string | null | undefined): boolean {
  return !!status && PREMIUM_STATUSES.has(status);
}

export function lobbyCapacityFor(status: string | null | undefined): number {
  return isPremiumStatus(status) ? PREMIUM_LOBBY_CAPACITY : FREE_LOBBY_CAPACITY;
}
