// Capacité d'un groupe selon le statut d'abonnement.
// Source de vérité côté SQL : public.compute_max_members(uid). Miroir TS
// pour afficher la capacité côté UI sans aller-retour réseau.
import { isPremiumStatus } from "./lobbyCapacity";

export const FREE_GROUP_CAPACITY = 4;
export const PREMIUM_GROUP_CAPACITY = 16;

export function groupCapacityFor(status: string | null | undefined): number {
  return isPremiumStatus(status) ? PREMIUM_GROUP_CAPACITY : FREE_GROUP_CAPACITY;
}
