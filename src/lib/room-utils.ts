import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Quitte tous les lobbies actifs de l'utilisateur sauf targetRoomId.
 * - Hôte d'un lobby → supprime la room entière (cascade sur room_players)
 * - Joueur simple → supprime uniquement son entrée
 *
 * Appelé côté client juste avant de rejoindre un nouveau salon.
 */
export async function leaveOtherLobbies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  targetRoomId: string
): Promise<void> {
  // Récupérer toutes les rooms où le joueur est présent (sauf la cible)
  const { data: memberships } = await supabase
    .from("room_players")
    .select("room_id, is_host")
    .eq("user_id", userId)
    .neq("room_id", targetRoomId);

  if (!memberships || memberships.length === 0) return;

  // Récupérer les rooms concernées (toutes phases : lobby, discuss, result…)
  // Exception : ne pas quitter une partie en cours de jeu actif (discussion/vote/reveal)
  // pour éviter de casser une game où les autres joueurs sont encore actifs.
  const roomIds = memberships.map((m) => m.room_id);
  const { data: rooms } = await supabase
    .from("game_rooms")
    .select("id, phase")
    .in("id", roomIds);

  if (!rooms || rooms.length === 0) return;

  for (const room of rooms) {
    const membership = memberships.find((m) => m.room_id === room.id);
    if (membership?.is_host) {
      // L'hôte supprime toute la room — cascade sur room_players
      await supabase.from("game_rooms").delete().eq("id", room.id);
    } else {
      // Simple joueur → quitter sans supprimer la room
      await supabase
        .from("room_players")
        .delete()
        .eq("room_id", room.id)
        .eq("user_id", userId);
    }
  }
}
