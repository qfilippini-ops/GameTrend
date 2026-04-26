// Helper client pour appeler la RPC SQL `safe_join_room` et mapper les
// erreurs sur des libellés i18n. Cette RPC est atomique :
//   1. kick l'utilisateur de tout autre lobby (transfert d'hôte propre via
//      quit_room_fn si besoin)
//   2. vérifie que la room cible existe et est en phase 'lobby'
//   3. vérifie le pseudo libre
//   4. vérifie la capacité (4 free / 16 premium, via trigger)
//   5. insère room_players
//
// Tout est en une seule transaction PL/pgSQL → impossible d'être dans deux
// lobbies en même temps, même en cas de double-clic ou de race condition.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SafeJoinLabels {
  errRoomNotFound: string;
  errAlreadyStarted: string;
  errNickTaken: string;
  errLobbyFull: string;
  errWrongGame?: string;
}

export interface SafeJoinResult {
  ok: boolean;
  displayName?: string;
  /** Statut renvoyé par la RPC : 'joined' | 'reconnect' (utile pour analytics). */
  status?: string;
  error?: string;
}

/**
 * @param supabase Client Supabase déjà authentifié (anon ou perso).
 * @param code     Code de la room (sera uppercasé/trim côté SQL aussi).
 * @param name     Pseudo. Sera trimé côté SQL.
 * @param labels   Libellés traduits pour mapper les erreurs.
 */
export async function safeJoinRoom(
  supabase: SupabaseClient,
  code: string,
  name: string,
  labels: SafeJoinLabels
): Promise<SafeJoinResult> {
  const { data, error } = await supabase.rpc("safe_join_room", {
    p_room_id: code,
    p_display_name: name,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("room_not_found")) return { ok: false, error: labels.errRoomNotFound };
    if (msg.includes("game_already_started")) return { ok: false, error: labels.errAlreadyStarted };
    if (msg.includes("display_name_taken")) return { ok: false, error: labels.errNickTaken };
    if (msg.includes("lobby_full")) return { ok: false, error: labels.errLobbyFull };
    return { ok: false, error: msg };
  }

  const payload = data as { status?: string; display_name?: string } | null;
  return {
    ok: true,
    status: payload?.status,
    displayName: payload?.display_name ?? name,
  };
}
