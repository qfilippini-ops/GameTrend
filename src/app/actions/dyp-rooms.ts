// @ts-nocheck
"use server";

/**
 * Server Actions spécifiques au mode online de DYP.
 *
 * Conservées séparées de `rooms.ts` (qui contient les actions GhostWord)
 * pour limiter le risque de régression et garder une responsabilité claire
 * par jeu. Les helpers communs (`leaveAllOtherRooms`) sont importés depuis
 * `rooms.ts`.
 */

import { createClient } from "@/lib/supabase/server";
import { leaveAllOtherRooms } from "@/app/actions/rooms";
import {
  DEFAULT_CONFIG,
  getValidBracketSizes,
} from "@/games/dyp/engine";
import {
  DYP_MIN_PLAYERS,
  DYP_TOUR_MIN_SECONDS,
  DYP_TOUR_MAX_SECONDS,
  DYP_TOUR_DEFAULT_SECONDS,
  DYP_TIE_BREAKS,
  DYP_BRACKET_SIZES,
  type DypTieBreak,
} from "@/games/dyp/online-config";
import type { DYPConfig, DYPCard } from "@/types/games";

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

/** Choisit la plus grande taille de bracket valide ≤ desired et ≤ cardCount. */
function clampBracketSize(desired: number, cardCount: number): number {
  const valid = getValidBracketSizes(cardCount);
  if (valid.length === 0) return 0;
  // valid est trié croissant
  const candidates = valid.filter((s) => s <= desired);
  return candidates.length > 0 ? candidates[candidates.length - 1] : valid[0];
}

// ── Création d'un salon ─────────────────────────────────────────
export interface CreateDypRoomOptions {
  presetId: string | null;
  bracketSize: number;
  tourTimeSeconds: number;
  tieBreak: DypTieBreak;
  isPrivate?: boolean;
}

export async function createDypRoom(
  options: CreateDypRoomOptions
): Promise<{ code: string } | { error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Non connecté — recharge la page" };

    const tourTimeSeconds = Math.max(
      DYP_TOUR_MIN_SECONDS,
      Math.min(DYP_TOUR_MAX_SECONDS, options.tourTimeSeconds)
    );
    if (!DYP_TIE_BREAKS.includes(options.tieBreak)) {
      return { error: "tieBreak invalide" };
    }
    if (!DYP_BRACKET_SIZES.includes(options.bracketSize as never)) {
      return { error: "bracketSize invalide" };
    }

    await leaveAllOtherRooms();

    const code = generateCode();

    const { error: roomErr } = await supabase.from("game_rooms").insert({
      id: code,
      host_id: user.id,
      game_type: "dyp",
      // L'état dynamique de la partie sera ajouté à `config.dyp` au start.
      // Ici on stocke seulement les paramètres choisis dans le lobby.
      config: {
        dyp_settings: {
          presetId: options.presetId,
          bracketSize: options.bracketSize,
          tourTimeSeconds,
          tieBreak: options.tieBreak,
        },
      },
      is_private: options.isPrivate ?? true,
    });
    if (roomErr) {
      console.error("[createDypRoom] insert game_rooms:", roomErr);
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
      console.error("[createDypRoom] insert room_players:", playerErr);
      return { error: `Erreur ajout joueur: ${playerErr.message}` };
    }

    return { code };
  } catch (e) {
    console.error("[createDypRoom] exception:", e);
    return { error: `Erreur inattendue: ${String(e)}` };
  }
}

// ── Mise à jour des paramètres (depuis la salle d'attente) ──────
export async function updateDypSettings(
  roomId: string,
  settings: {
    presetId?: string | null;
    bracketSize?: number;
    tourTimeSeconds?: number;
    tieBreak?: DypTieBreak;
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
  const current = (cfg.dyp_settings ?? {}) as Record<string, unknown>;
  const merged = { ...current, ...settings };

  if (
    typeof merged.tourTimeSeconds === "number" &&
    (merged.tourTimeSeconds < DYP_TOUR_MIN_SECONDS ||
      merged.tourTimeSeconds > DYP_TOUR_MAX_SECONDS)
  ) {
    return { error: "tourTimeSeconds hors plage" };
  }
  if (
    typeof merged.tieBreak === "string" &&
    !DYP_TIE_BREAKS.includes(merged.tieBreak as DypTieBreak)
  ) {
    return { error: "tieBreak invalide" };
  }
  if (
    typeof merged.bracketSize === "number" &&
    !DYP_BRACKET_SIZES.includes(merged.bracketSize as never)
  ) {
    return { error: "bracketSize invalide" };
  }

  const newConfig = { ...cfg, dyp_settings: merged };
  const { error } = await supabase
    .from("game_rooms")
    .update({ config: newConfig })
    .eq("id", roomId);
  if (error) return { error: error.message };
  return {};
}

// ── Démarrage d'une partie ──────────────────────────────────────
export async function startDypGame(
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
  if (room.game_type !== "dyp") return { error: "Mauvais type de jeu" };
  if (room.phase !== "lobby") return { error: "Partie déjà démarrée" };

  const settings = ((room.config ?? {}) as Record<string, unknown>).dyp_settings as
    | {
        presetId?: string | null;
        bracketSize?: number;
        tourTimeSeconds?: number;
        tieBreak?: DypTieBreak;
      }
    | undefined;

  if (!settings) return { error: "Paramètres manquants" };

  const { count: playersCount } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if ((playersCount ?? 0) < DYP_MIN_PLAYERS) {
    return { error: `Il faut au moins ${DYP_MIN_PLAYERS} joueurs` };
  }

  // Charger les cartes : preset choisi ou DEFAULT
  let cards: DYPCard[] = DEFAULT_CONFIG.cards;
  if (settings.presetId) {
    const { data: preset } = await supabase
      .from("presets")
      .select("config")
      .eq("id", settings.presetId)
      .maybeSingle();
    if (preset?.config) {
      const c = preset.config as unknown as DYPConfig;
      if (c.cards && c.cards.length > 0) cards = c.cards;
    }
  }

  const bracketSize = clampBracketSize(
    settings.bracketSize ?? 8,
    cards.length
  );
  if (bracketSize < 2) return { error: "Preset trop petit" };

  const tourTimeSeconds = Math.max(
    DYP_TOUR_MIN_SECONDS,
    Math.min(
      DYP_TOUR_MAX_SECONDS,
      settings.tourTimeSeconds ?? DYP_TOUR_DEFAULT_SECONDS
    )
  );
  const tieBreak: DypTieBreak =
    settings.tieBreak === "first" ? "first" : "random";

  // Tirage des cartes : on shuffle et on garde bracketSize cartes
  const drawn = shuffle(cards).slice(0, bracketSize);
  const totalRounds = Math.log2(bracketSize);

  // Round 1 : on apparie 2 par 2 dans l'ordre du tirage
  const round1Matches = [] as Array<{
    matchId: string;
    card1Id: string;
    card2Id: string;
    winnerId: string | null;
  }>;
  for (let i = 0; i < drawn.length; i += 2) {
    round1Matches.push({
      matchId: `r1m${i / 2}`,
      card1Id: drawn[i].id,
      card2Id: drawn[i + 1].id,
      winnerId: null,
    });
  }

  const dypState = {
    presetId: settings.presetId ?? null,
    bracketSize,
    tourTimeSeconds,
    tieBreak,
    cards: drawn,
    totalRounds,
    bracket: [round1Matches],
    currentRound: 1,
    currentMatchIndex: 0,
    currentRoundStartedAt: new Date().toISOString(),
    pendingTransition: false,
    transitionStartedAt: null,
    championId: null,
    finished: false,
  };

  const newConfig = {
    ...((room.config ?? {}) as Record<string, unknown>),
    dyp: dypState,
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

  if (settings.presetId) {
    const { error: rpcErr } = await supabase.rpc(
      "increment_preset_play_count",
      { p_preset_id: settings.presetId }
    );
    if (rpcErr) console.error("[increment_preset_play_count]", rpcErr);
  }

  return {};
}
