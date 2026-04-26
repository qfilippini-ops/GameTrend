// @ts-nocheck
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdapter } from "@/games/registry";
import { lobbyCapacityFor } from "@/lib/premium/lobbyCapacity";

// ── Génération du code court ──────────────────────────────────
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // pas I/O/0/1
function generateCode(): string {
  return Array.from(
    { length: 6 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}

// ── Quitter tous les autres lobbies (appelé avant create/join) ─
// Exécuté côté serveur pour garantir que la session est bien lue depuis les cookies
export async function leaveAllOtherRooms(keepRoomId?: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Trouver toutes les rooms où l'utilisateur est présent (hors targetRoomId)
  const query = supabase
    .from("room_players")
    .select("room_id, is_host")
    .eq("user_id", user.id);

  const result = keepRoomId ? await query.neq("room_id", keepRoomId) : await query;
  const memberships = result.data as Array<{ room_id: string; is_host: boolean }> | null;

  if (!memberships || memberships.length === 0) return;

  for (const m of memberships) {
    if (m.is_host) {
      // Hôte → supprimer toute la room (cascade sur room_players)
      await supabase.from("game_rooms").delete().eq("id", m.room_id);
    } else {
      // Joueur → supprimer uniquement son entrée
      await supabase.from("room_players").delete()
        .eq("room_id", m.room_id).eq("user_id", user.id);
    }
  }
}

// ── Créer un salon ────────────────────────────────────────────
export async function createRoom(options: {
  gameType: string;
  presetIds: string[];
  ombrePercent: number;
  discussionTurns: number;
  speakerDuration: number;
  isPrivate?: boolean;
}): Promise<{ code: string } | { error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Non connecté — recharge la page" };

    // Quitter tous les autres lobbies avant de créer le nouveau
    await leaveAllOtherRooms();

    const code = generateCode();

    // Capacité selon le statut premium du host (4 free / 16 premium).
    // Le trigger SQL valide aussi côté BDD : on ne peut pas tricher.
    const { data: profileForCap } = await supabase
      .from("profiles")
      .select("subscription_status")
      .eq("id", user.id)
      .maybeSingle();
    const maxPlayers = lobbyCapacityFor(profileForCap?.subscription_status);

    const { error: roomErr } = await supabase.from("game_rooms").insert({
      id: code,
      host_id: user.id,
      game_type: options.gameType,
      config: {
        presetIds: options.presetIds,
        ombrePercent: options.ombrePercent,
      },
      discussion_turns_per_round: options.discussionTurns,
      speaker_duration_seconds: options.speakerDuration,
      is_private: options.isPrivate ?? true,
      max_players: maxPlayers,
    });
    if (roomErr) {
      console.error("[createRoom] game_rooms insert:", roomErr);
      return { error: `Erreur création salon: ${roomErr.message}` };
    }

    // Récupérer le pseudo du host
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const displayName = profile?.username ?? user.email?.split("@")[0] ?? "Hôte";

    // Insérer le host comme joueur
    const { error: playerErr } = await supabase.from("room_players").insert({
      room_id: code,
      user_id: user.id,
      display_name: displayName,
      is_host: true,
      join_order: 0,
    });
    if (playerErr) {
      console.error("[createRoom] room_players insert:", playerErr);
      return { error: `Erreur ajout joueur: ${playerErr.message}` };
    }

    // Best-effort : partage le lobby dans le groupe du host (no-op si pas de groupe).
    try {
      await supabase.rpc("share_lobby_to_group", { p_room_id: code });
    } catch (shareErr) {
      console.error("[createRoom] share_lobby_to_group:", shareErr);
    }

    return { code };
  } catch (e) {
    console.error("[createRoom] exception:", e);
    return { error: `Erreur inattendue: ${String(e)}` };
  }
}

// ── Rejoindre un salon ────────────────────────────────────────
// Wrapper autour de la RPC SQL `safe_join_room` qui garantit atomiquement :
//   1. l'éviction des autres lobbies (1 user = 1 lobby)
//   2. la vérification de capacité (4 free / 16 premium)
//   3. l'unicité du pseudo
//   4. la phase 'lobby'
//
// Cette server action n'est plus utilisée par les pages online (qui appellent
// directement `safeJoinRoom` côté client), mais est conservée pour
// rétro-compatibilité d'éventuels appelants externes.
export async function joinRoom(
  code: string,
  displayName: string
): Promise<{ success: true; myName: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié — recharge la page" };

  const { data, error } = await supabase.rpc("safe_join_room", {
    p_room_id: code.toUpperCase().trim(),
    p_display_name: displayName,
  });
  if (error) {
    const m = error.message || "";
    if (m.includes("room_not_found")) return { error: "Salon introuvable — vérifie le code" };
    if (m.includes("game_already_started")) return { error: "La partie a déjà commencé" };
    if (m.includes("display_name_taken")) return { error: "Ce pseudo est déjà pris dans ce salon" };
    if (m.includes("lobby_full")) return { error: "Salon complet" };
    return { error: error.message };
  }

  const payload = data as { display_name?: string } | null;
  return { success: true, myName: payload?.display_name ?? displayName };
}

// ── Lancer la partie (host) ───────────────────────────────────
export async function startOnlineGame(
  roomId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: room } = await supabase
    .from("game_rooms")
    .select("host_id, config, discussion_turns_per_round")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.host_id !== user.id) return { error: "Accès refusé" };

  const { data: players } = await supabase
    .from("room_players")
    .select("display_name, join_order")
    .eq("room_id", roomId)
    .order("join_order");
  if (!players || players.length < 3)
    return { error: "Il faut au moins 3 joueurs" };

  // Charger le preset choisi
  const config = room.config as { presetIds?: string[]; ombrePercent?: number };
  let presetConfig: unknown = null;
  if (config.presetIds && config.presetIds.length > 0) {
    const presetId =
      config.presetIds[Math.floor(Math.random() * config.presetIds.length)];
    const { data: preset } = await supabase
      .from("presets")
      .select("config")
      .eq("id", presetId)
      .maybeSingle();
    if (preset?.config) {
      presetConfig = preset.config;
      // Incrémenter play_count uniquement du preset effectivement utilisé.
      const { error: rpcErr } = await supabase.rpc(
        "increment_preset_play_count",
        { p_preset_id: presetId }
      );
      if (rpcErr) console.error("[increment_preset_play_count]", rpcErr);
    }
  }

  // Générer les assignations via l'adapter du jeu
  const adapter = getAdapter(room.game_type);
  const playerNames = players.map((p) => p.display_name);
  const assignments = adapter.assignPlayers({
    playerNames,
    presetConfig,
    options: { ombrePercent: config.ombrePercent ?? 90 },
  });

  // Stocker les données privées (role/word) dans room_players
  for (const assignment of assignments) {
    await supabase
      .from("room_players")
      .update({
        role: assignment.role,
        word: assignment.word,
        word_image_url: assignment.word_image_url,
        is_ready: false,
      })
      .eq("room_id", roomId)
      .eq("display_name", assignment.display_name);
  }

  await supabase
    .from("game_rooms")
    .update({ phase: "reveal" })
    .eq("id", roomId);

  return {};
}

// ── Récupérer ses données privées (rôle + mot) ────────────────
// Ne doit être appelée qu'en phase "reveal"
export async function getMyPrivateData(roomId: string): Promise<
  | { role: string; word: string | null; wordImageUrl: string | null }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data } = await supabase
    .from("room_players")
    .select("role, word, word_image_url")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { error: "Joueur non trouvé" };

  return {
    role: data.role,
    word: data.word,
    wordImageUrl: data.word_image_url,
  };
}

// ── Confirmer "mémorisé" en phase reveal ──────────────────────
export async function confirmRevealReady(
  roomId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  await supabase
    .from("room_players")
    .update({ is_ready: true })
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  // Si tous les joueurs sont prêts → discussion
  const { count: total } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("is_eliminated", false);

  const { count: ready } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("is_ready", true);

  if (total && ready && ready >= total) {
    await supabase
      .from("game_rooms")
      .update({
        phase: "discussion",
        discussion_turn: 1,
        current_speaker_index: 0,
        speaker_started_at: new Date().toISOString(),
      })
      .eq("id", roomId);
  }
  return {};
}

// ── Envoyer un message (phase discussion) ────────────────────
export async function sendDiscussionMessage(
  roomId: string,
  message: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: me } = await supabase
    .from("room_players")
    .select("display_name")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: room } = await supabase
    .from("game_rooms")
    .select(
      "discussion_turn, vote_round, current_speaker_index, discussion_turns_per_round"
    )
    .eq("id", roomId)
    .maybeSingle();

  if (!me || !room) return { error: "Erreur" };

  // Insérer le message
  await supabase.from("room_messages").insert({
    room_id: roomId,
    player_name: me.display_name,
    message: message.trim() || "(passe)",
    discussion_turn: room.discussion_turn,
    vote_round: room.vote_round,
  });

  // Passer au prochain speaker
  const { data: alive } = await supabase
    .from("room_players")
    .select("display_name")
    .eq("room_id", roomId)
    .eq("is_eliminated", false)
    .order("join_order");

  if (!alive) return {};

  const nextIndex = room.current_speaker_index + 1;

  if (nextIndex >= alive.length) {
    // Tout le monde a parlé ce tour
    if (room.discussion_turn >= room.discussion_turns_per_round) {
      // → Vote
      await supabase
        .from("game_rooms")
        .update({ phase: "vote", current_speaker_index: 0 })
        .eq("id", roomId);
    } else {
      // → Tour suivant
      await supabase
        .from("game_rooms")
        .update({
          discussion_turn: room.discussion_turn + 1,
          current_speaker_index: 0,
          speaker_started_at: new Date().toISOString(),
        })
        .eq("id", roomId);
    }
  } else {
    await supabase
      .from("game_rooms")
      .update({
        current_speaker_index: nextIndex,
        speaker_started_at: new Date().toISOString(),
      })
      .eq("id", roomId);
  }

  return {};
}

// ── Voter (phase vote) ────────────────────────────────────────────────
// Le vote est inséré directement par le client (`OnlineVote.tsx`) dans la
// table `room_votes`. C'est l'INSERT qui déclenche le trigger PostgreSQL
// `process_vote_fn` (cf. supabase/schema_fix_vote_trigger.sql), qui gère
// atomiquement : check du quorum, tally, égalité (tour de prolongation),
// élimination, condition de victoire, transition de phase.
//
// Aucune Server Action n'est nécessaire ici : tout est en BDD pour éviter
// toute duplication de logique et toute race condition.

// ── Récupérer résultats complets (phase result) ───────────────
export interface RoomResultData {
  players: Array<{ displayName: string; role: string; word: string | null; isEliminated: boolean }>;
  voteRounds: Array<{
    round: number;
    votes: Array<{ voter: string; target: string }>;
    eliminated: string | null;
    wasTie: boolean;
  }>;
}

export async function getRoomResults(roomId: string): Promise<RoomResultData | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  // Accepter result + toutes les phases (pour affichage partiel si le jeu s'arrête)
  const { data: players } = await supabase
    .from("room_players")
    .select("display_name, role, word, is_eliminated")
    .eq("room_id", roomId)
    .order("join_order");

  const { data: allVotes } = await supabase
    .from("room_votes")
    .select("voter_name, target_name, vote_round")
    .eq("room_id", roomId)
    .order("vote_round");

  // Regrouper les votes par round
  const roundsMap = new Map<number, Array<{ voter: string; target: string }>>();
  for (const v of allVotes ?? []) {
    if (!roundsMap.has(v.vote_round)) roundsMap.set(v.vote_round, []);
    roundsMap.get(v.vote_round)!.push({ voter: v.voter_name, target: v.target_name });
  }

  const voteRounds = Array.from(roundsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, votes]) => {
      // Tally pour ce round
      const tally: Record<string, number> = {};
      votes.forEach((v) => { tally[v.target] = (tally[v.target] ?? 0) + 1; });
      const maxVotes = Math.max(...Object.values(tally), 0);
      const tied = Object.entries(tally).filter(([, c]) => c === maxVotes);
      const wasTie = tied.length > 1;
      const eliminated = wasTie ? null : (tied[0]?.[0] ?? null);
      return { round, votes, eliminated, wasTie };
    });

  return {
    players: (players ?? []).map((p) => ({
      displayName: p.display_name,
      role: p.role ?? "initie",
      word: p.word,
      isEliminated: p.is_eliminated,
    })),
    voteRounds,
  };
}
