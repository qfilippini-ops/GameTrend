// @ts-nocheck
"use server";

/**
 * Server Actions spécifiques au mode online de Blind Rank.
 *
 * Conservées séparées de `rooms.ts` (qui contient les actions GhostWord)
 * pour limiter le risque de régression et garder une responsabilité claire
 * par jeu. Les helpers communs (`leaveAllOtherRooms`, `joinRoom`) sont
 * importés depuis `rooms.ts`.
 */

import { createClient } from "@/lib/supabase/server";
import { leaveAllOtherRooms } from "@/app/actions/rooms";
import {
  DEFAULT_CONFIG,
  clampRackSize,
} from "@/games/blindrank/engine";
import {
  BLINDRANK_MIN_PLAYERS,
  BLINDRANK_TOUR_MIN_SECONDS,
  BLINDRANK_TOUR_MAX_SECONDS,
  BLINDRANK_TOUR_DEFAULT_SECONDS,
  BLINDRANK_TIE_BREAKS,
  type BlindRankTieBreak,
} from "@/games/blindrank/online-config";
import type { BlindRankConfig } from "@/types/games";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  return Array.from(
    { length: 6 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Création d'un salon ─────────────────────────────────────────
export interface CreateBlindRankRoomOptions {
  presetId: string | null;
  rackSize: number;
  tourTimeSeconds: number;
  tieBreak: BlindRankTieBreak;
  isPrivate?: boolean;
}

export async function createBlindRankRoom(
  options: CreateBlindRankRoomOptions
): Promise<{ code: string } | { error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Non connecté — recharge la page" };

    // Bornes de sécurité côté serveur (defense in depth)
    const tourTimeSeconds = Math.max(
      BLINDRANK_TOUR_MIN_SECONDS,
      Math.min(BLINDRANK_TOUR_MAX_SECONDS, options.tourTimeSeconds)
    );
    if (!BLINDRANK_TIE_BREAKS.includes(options.tieBreak)) {
      return { error: "tieBreak invalide" };
    }

    await leaveAllOtherRooms();

    const code = generateCode();

    const { error: roomErr } = await supabase.from("game_rooms").insert({
      id: code,
      host_id: user.id,
      game_type: "blindrank",
      // L'état dynamique de la partie sera ajouté à `config.blindrank` au start.
      // Ici on stocke seulement les paramètres choisis dans le lobby.
      config: {
        blindrank_settings: {
          presetId: options.presetId,
          rackSize: options.rackSize,
          tourTimeSeconds,
          tieBreak: options.tieBreak,
        },
      },
      is_private: options.isPrivate ?? true,
    });
    if (roomErr) {
      console.error("[createBlindRankRoom] insert game_rooms:", roomErr);
      return { error: `Erreur création salon: ${roomErr.message}` };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    const displayName = profile?.username ?? user.email?.split("@")[0] ?? "Hôte";

    const { error: playerErr } = await supabase.from("room_players").insert({
      room_id: code,
      user_id: user.id,
      display_name: displayName,
      is_host: true,
      join_order: 0,
    });
    if (playerErr) {
      console.error("[createBlindRankRoom] insert room_players:", playerErr);
      return { error: `Erreur ajout joueur: ${playerErr.message}` };
    }

    return { code };
  } catch (e) {
    console.error("[createBlindRankRoom] exception:", e);
    return { error: `Erreur inattendue: ${String(e)}` };
  }
}

// ── Mise à jour des paramètres (depuis la salle d'attente) ──────
export async function updateBlindRankSettings(
  roomId: string,
  settings: {
    presetId?: string | null;
    rackSize?: number;
    tourTimeSeconds?: number;
    tieBreak?: BlindRankTieBreak;
  }
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: room } = await supabase
    .from("game_rooms")
    .select("host_id, config, phase")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return { error: "Salon introuvable" };
  if (room.host_id !== user.id) return { error: "Accès refusé" };
  if (room.phase !== "lobby") return { error: "Partie déjà commencée" };

  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const current = (cfg.blindrank_settings ?? {}) as Record<string, unknown>;
  const merged = { ...current, ...settings };

  if (
    typeof merged.tourTimeSeconds === "number" &&
    (merged.tourTimeSeconds < BLINDRANK_TOUR_MIN_SECONDS ||
      merged.tourTimeSeconds > BLINDRANK_TOUR_MAX_SECONDS)
  ) {
    return { error: "tourTimeSeconds hors plage" };
  }
  if (
    typeof merged.tieBreak === "string" &&
    !BLINDRANK_TIE_BREAKS.includes(merged.tieBreak as BlindRankTieBreak)
  ) {
    return { error: "tieBreak invalide" };
  }

  const newConfig = { ...cfg, blindrank_settings: merged };
  const { error } = await supabase
    .from("game_rooms")
    .update({ config: newConfig })
    .eq("id", roomId);
  if (error) return { error: error.message };
  return {};
}

// ── Démarrage d'une partie ──────────────────────────────────────
export async function startBlindRankGame(
  roomId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: room } = await supabase
    .from("game_rooms")
    .select("host_id, config, game_type, phase")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return { error: "Salon introuvable" };
  if (room.host_id !== user.id) return { error: "Accès refusé" };
  if (room.game_type !== "blindrank") return { error: "Mauvais type de jeu" };
  if (room.phase !== "lobby") return { error: "Partie déjà démarrée" };

  const settings = ((room.config ?? {}) as Record<string, unknown>)
    .blindrank_settings as
    | {
        presetId?: string | null;
        rackSize?: number;
        tourTimeSeconds?: number;
        tieBreak?: BlindRankTieBreak;
      }
    | undefined;

  if (!settings) return { error: "Paramètres manquants" };

  const { count: playersCount } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if ((playersCount ?? 0) < BLINDRANK_MIN_PLAYERS) {
    return { error: `Il faut au moins ${BLINDRANK_MIN_PLAYERS} joueurs` };
  }

  // Charger les cartes : preset choisi ou DEFAULT
  let cards: BlindRankConfig["cards"] = DEFAULT_CONFIG.cards;
  if (settings.presetId) {
    const { data: preset } = await supabase
      .from("presets")
      .select("config")
      .eq("id", settings.presetId)
      .maybeSingle();
    if (preset?.config) {
      const c = preset.config as unknown as BlindRankConfig;
      if (c.cards && c.cards.length > 0) cards = c.cards;
    }
  }

  const rackSize = clampRackSize(
    settings.rackSize ?? 10,
    cards.length
  );
  if (rackSize < 2) return { error: "Preset trop petit" };

  const tourTimeSeconds = Math.max(
    BLINDRANK_TOUR_MIN_SECONDS,
    Math.min(
      BLINDRANK_TOUR_MAX_SECONDS,
      settings.tourTimeSeconds ?? BLINDRANK_TOUR_DEFAULT_SECONDS
    )
  );
  const tieBreak: BlindRankTieBreak =
    settings.tieBreak === "high" ? "high" : "low";

  // Tirage des cartes : on mélange et on ne garde que rackSize cartes
  const drawn = shuffle(cards).slice(0, rackSize);
  const drawOrder = drawn.map((c) => c.id);

  const blindrankState = {
    presetId: settings.presetId ?? null,
    rackSize,
    tourTimeSeconds,
    tieBreak,
    drawOrder,
    cards: drawn,
    currentCardIndex: 0,
    slots: Array.from({ length: rackSize }, () => null),
    currentRoundStartedAt: new Date().toISOString(),
    finished: false,
  };

  const newConfig = {
    ...((room.config ?? {}) as Record<string, unknown>),
    blindrank: blindrankState,
  };

  const { error: updErr } = await supabase
    .from("game_rooms")
    .update({
      phase: "playing",
      vote_round: 0,
      tie_count: 0,
      config: newConfig,
    })
    .eq("id", roomId)
    .eq("phase", "lobby");
  if (updErr) return { error: updErr.message };

  // Incrémenter le play_count du preset utilisé
  if (settings.presetId) {
    const { error: rpcErr } = await supabase.rpc(
      "increment_preset_play_count",
      { p_preset_id: settings.presetId }
    );
    if (rpcErr) console.error("[increment_preset_play_count]", rpcErr);
  }

  return {};
}
