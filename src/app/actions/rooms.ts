// @ts-nocheck
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdapter } from "@/games/registry";

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

    // Insérer le salon
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

    return { code };
  } catch (e) {
    console.error("[createRoom] exception:", e);
    return { error: `Erreur inattendue: ${String(e)}` };
  }
}

// ── Rejoindre un salon ────────────────────────────────────────
export async function joinRoom(
  code: string,
  displayName: string
): Promise<{ success: true; myName: string } | { error: string }> {
  const supabase = createClient();

  // L'auth anonyme est gérée côté client avant d'appeler cette action
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié — recharge la page" };

  const roomId = code.toUpperCase().trim();

  // Vérifier que la room existe et est en lobby
  const { data: room } = await supabase
    .from("game_rooms")
    .select("phase")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return { error: "Salon introuvable — vérifie le code" };
  if (room.phase !== "lobby") return { error: "La partie a déjà commencé" };

  // Déjà dans la room ? (reconnexion)
  const { data: alreadyIn } = await supabase
    .from("room_players")
    .select("display_name")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (alreadyIn) return { success: true, myName: alreadyIn.display_name };

  // Pseudo déjà pris ?
  const { data: taken } = await supabase
    .from("room_players")
    .select("display_name")
    .eq("room_id", roomId)
    .eq("display_name", displayName)
    .maybeSingle();
  if (taken) return { error: "Ce pseudo est déjà pris dans ce salon" };

  const { count } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);

  const { error } = await supabase.from("room_players").insert({
    room_id: roomId,
    user_id: user.id,
    display_name: displayName,
    is_host: false,
    join_order: count ?? 1,
  });
  if (error) return { error: error.message };

  return { success: true, myName: displayName };
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
      // Incrémenter play_count du preset sélectionné
      await supabase.rpc("increment_preset_play_count", { p_preset_id: presetId });
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

// ── Voter (phase vote) ────────────────────────────────────────
export async function castOnlineVote(
  roomId: string,
  targetName: string
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
    .select("vote_round, discussion_turns_per_round, game_type")
    .eq("id", roomId)
    .maybeSingle();

  if (!me || !room) return { error: "Erreur" };

  // Upsert vote (un vote par joueur par round)
  await supabase.from("room_votes").upsert({
    room_id: roomId,
    voter_name: me.display_name,
    target_name: targetName,
    vote_round: room.vote_round,
  });

  // Vérifier si tous les joueurs en vie ont voté
  const { data: alive } = await supabase
    .from("room_players")
    .select("display_name, role")
    .eq("room_id", roomId)
    .eq("is_eliminated", false);

  const { data: votes } = await supabase
    .from("room_votes")
    .select("voter_name, target_name")
    .eq("room_id", roomId)
    .eq("vote_round", room.vote_round);

  if (!alive || !votes || votes.length < alive.length) return {};

  // Dépouillement
  const tally: Record<string, number> = {};
  votes.forEach((v) => {
    tally[v.target_name] = (tally[v.target_name] ?? 0) + 1;
  });
  const maxVotes = Math.max(...Object.values(tally));
  const topCandidates = Object.entries(tally)
    .filter(([, count]) => count === maxVotes);

  // Égalité → Tour de prolongation : personne n'est éliminé, on re-vote
  if (topCandidates.length > 1) {
    const { data: currentRoom } = await supabase
      .from("game_rooms")
      .select("tie_count")
      .eq("id", roomId)
      .maybeSingle();

    await supabase
      .from("game_rooms")
      .update({
        vote_round: room.vote_round + 1,
        tie_count: (currentRoom?.tie_count ?? 0) + 1,
      })
      .eq("id", roomId);

    return {};
  }

  const eliminated = topCandidates[0][0];

  await supabase
    .from("room_players")
    .update({ is_eliminated: true })
    .eq("room_id", roomId)
    .eq("display_name", eliminated);

  // Condition de victoire
  const { data: stillAlive } = await supabase
    .from("room_players")
    .select("display_name, role")
    .eq("room_id", roomId)
    .eq("is_eliminated", false);

  // Déléguer la condition de victoire à l'adapter du jeu
  const adapter = getAdapter(room.game_type ?? "ghostword");
  const eliminatedPlayer = alive?.find((p) => p.display_name === eliminated);
  const { gameOver, winner } = adapter.resolveElimination({
    eliminatedRole: eliminatedPlayer?.role ?? "",
    remainingPlayers: stillAlive ?? [],
  });

  if (gameOver && winner) {
    await supabase
      .from("game_rooms")
      .update({ phase: "result", winner })
      .eq("id", roomId);
  } else {
    // Tour suivant — réinitialise tie_count (nouvelle phase d'élimination)
    await supabase
      .from("game_rooms")
      .update({
        phase: "discussion",
        discussion_turn: 1,
        vote_round: room.vote_round + 1,
        current_speaker_index: 0,
        speaker_started_at: new Date().toISOString(),
        tie_count: 0,
      })
      .eq("id", roomId);
    await supabase
      .from("room_players")
      .update({ is_ready: false })
      .eq("room_id", roomId);
  }

  return {};
}

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
