// @ts-nocheck
"use server";

/**
 * Server Actions spécifiques au mode online de Outbid (1v1 enchères).
 *
 * Calqué sur dyp-rooms.ts et blindrank-rooms.ts. Le `dyp_settings` est ici
 * remplacé par `outbid_settings` ; l'état dynamique de partie est dans
 * `config.outbid` et l'essentiel de la logique est en SQL (voir
 * `supabase/schema_outbid_online.sql`).
 */

import { createClient } from "@/lib/supabase/server";
import { leaveAllOtherRooms } from "@/app/actions/rooms";
import {
  OUTBID_MIN_PLAYERS,
  OUTBID_TOUR_MIN_SECONDS,
  OUTBID_TOUR_MAX_SECONDS,
  OUTBID_TOUR_DEFAULT_SECONDS,
  OUTBID_TEAM_MIN,
  OUTBID_TEAM_MAX,
  OUTBID_TEAM_DEFAULT,
  OUTBID_OPENING_BIDDERS,
  OUTBID_STARTING_POINTS,
  OUTBID_OPENING_BID,
  type OutbidOpeningBidder,
} from "@/games/outbid/online-config";
import type { DYPCard, DYPConfig } from "@/types/games";

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

function clampTeamSize(desired: number): number {
  if (!Number.isFinite(desired)) return OUTBID_TEAM_DEFAULT;
  return Math.max(OUTBID_TEAM_MIN, Math.min(OUTBID_TEAM_MAX, Math.round(desired)));
}

// ── Création d'un salon ─────────────────────────────────────────
export interface CreateOutbidRoomOptions {
  presetId: string | null;
  teamSize: number;
  tourTimeSeconds: number;
  openingBidder: OutbidOpeningBidder;
  isPrivate?: boolean;
}

export async function createOutbidRoom(
  options: CreateOutbidRoomOptions
): Promise<{ code: string } | { error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Non connecté — recharge la page" };

    const teamSize = clampTeamSize(options.teamSize);
    const tourTimeSeconds = Math.max(
      OUTBID_TOUR_MIN_SECONDS,
      Math.min(OUTBID_TOUR_MAX_SECONDS, options.tourTimeSeconds)
    );
    if (!OUTBID_OPENING_BIDDERS.includes(options.openingBidder)) {
      return { error: "openingBidder invalide" };
    }

    await leaveAllOtherRooms();

    const code = generateCode();

    // Outbid est strictement 1v1 : capacité = 2 indépendamment du statut
    // premium du host. Le trigger SQL accepte (2 ≤ cap).
    const { error: roomErr } = await supabase.from("game_rooms").insert({
      id: code,
      host_id: user.id,
      game_type: "outbid",
      config: {
        outbid_settings: {
          presetId: options.presetId,
          teamSize,
          tourTimeSeconds,
          openingBidder: options.openingBidder,
        },
      },
      is_private: options.isPrivate ?? true,
      max_players: 2,
    });
    if (roomErr) {
      console.error("[createOutbidRoom] insert game_rooms:", roomErr);
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
      console.error("[createOutbidRoom] insert room_players:", playerErr);
      return { error: `Erreur ajout joueur: ${playerErr.message}` };
    }

    try {
      await supabase.rpc("share_lobby_to_group", { p_room_id: code });
    } catch (shareErr) {
      console.error("[createOutbidRoom] share_lobby_to_group:", shareErr);
    }

    return { code };
  } catch (e) {
    console.error("[createOutbidRoom] exception:", e);
    return { error: `Erreur inattendue: ${String(e)}` };
  }
}

// ── Mise à jour des paramètres (depuis la salle d'attente) ──────
export async function updateOutbidSettings(
  roomId: string,
  settings: {
    presetId?: string | null;
    teamSize?: number;
    tourTimeSeconds?: number;
    openingBidder?: OutbidOpeningBidder;
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
  const current = (cfg.outbid_settings ?? {}) as Record<string, unknown>;
  const merged = { ...current, ...settings };

  if (
    typeof merged.tourTimeSeconds === "number" &&
    (merged.tourTimeSeconds < OUTBID_TOUR_MIN_SECONDS ||
      merged.tourTimeSeconds > OUTBID_TOUR_MAX_SECONDS)
  ) {
    return { error: "tourTimeSeconds hors plage" };
  }
  if (
    typeof merged.teamSize === "number" &&
    (merged.teamSize < OUTBID_TEAM_MIN || merged.teamSize > OUTBID_TEAM_MAX)
  ) {
    return { error: "teamSize hors plage" };
  }
  if (
    typeof merged.openingBidder === "string" &&
    !OUTBID_OPENING_BIDDERS.includes(merged.openingBidder as OutbidOpeningBidder)
  ) {
    return { error: "openingBidder invalide" };
  }

  const newConfig = { ...cfg, outbid_settings: merged };
  const { error } = await supabase
    .from("game_rooms")
    .update({ config: newConfig })
    .eq("id", roomId);
  if (error) return { error: error.message };
  return {};
}

// ── Démarrage d'une partie ──────────────────────────────────────
export async function startOutbidGame(
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
  if (room.game_type !== "outbid") return { error: "Mauvais type de jeu" };
  if (room.phase !== "lobby") return { error: "Partie déjà démarrée" };

  const settings = ((room.config ?? {}) as Record<string, unknown>)
    .outbid_settings as
    | {
        presetId?: string | null;
        teamSize?: number;
        tourTimeSeconds?: number;
        openingBidder?: OutbidOpeningBidder;
      }
    | undefined;

  if (!settings) return { error: "Paramètres manquants" };

  const { data: players } = await supabase
    .from("room_players")
    .select("display_name, join_order")
    .eq("room_id", roomId)
    .order("join_order", { ascending: true });
  if (!players || players.length < OUTBID_MIN_PLAYERS) {
    return { error: `Il faut ${OUTBID_MIN_PLAYERS} joueurs` };
  }
  if (players.length !== 2) {
    return { error: "Outbid se joue à 2 joueurs strictement" };
  }
  const playerAName = players[0].display_name as string;
  const playerBName = players[1].display_name as string;

  // Charger les cartes : preset choisi (obligatoire ou fallback léger)
  let cards: DYPCard[] = [];
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

  if (cards.length === 0) {
    return { error: "Aucun preset valide sélectionné" };
  }

  const teamSize = clampTeamSize(settings.teamSize ?? OUTBID_TEAM_DEFAULT);
  const cardsNeeded = teamSize * 2;
  if (cards.length < cardsNeeded) {
    return {
      error: `Le preset n'a que ${cards.length} cartes, il en faut au moins ${cardsNeeded}`,
    };
  }

  const tourTimeSeconds = Math.max(
    OUTBID_TOUR_MIN_SECONDS,
    Math.min(
      OUTBID_TOUR_MAX_SECONDS,
      settings.tourTimeSeconds ?? OUTBID_TOUR_DEFAULT_SECONDS
    )
  );
  const openingBidder: OutbidOpeningBidder = OUTBID_OPENING_BIDDERS.includes(
    settings.openingBidder as OutbidOpeningBidder
  )
    ? (settings.openingBidder as OutbidOpeningBidder)
    : "alternate";

  // Tirage : on shuffle et on garde teamSize*2 cartes
  const drawn = shuffle(cards).slice(0, cardsNeeded);
  const cardOrder = drawn.map((c) => c.id);

  // Tirage du 1er bidder au hasard
  const firstBidder = Math.random() < 0.5 ? playerAName : playerBName;
  const otherPlayer = firstBidder === playerAName ? playerBName : playerAName;

  const nowIso = new Date().toISOString();

  const outbidState = {
    presetId: settings.presetId ?? null,
    teamSize,
    tourTimeSeconds,
    openingBidder,
    cards: drawn,
    cardOrder,
    currentCardIndex: 0,
    currentBid: { amount: OUTBID_OPENING_BID, bidder: firstBidder },
    awaitingResponse: otherPlayer,
    decisionStartedAt: nowIso,
    playerA: {
      name: playerAName,
      points: OUTBID_STARTING_POINTS,
      team: [] as Array<{ cardId: string; price: number }>,
    },
    playerB: {
      name: playerBName,
      points: OUTBID_STARTING_POINTS,
      team: [] as Array<{ cardId: string; price: number }>,
    },
    firstBidder,
    lastWinner: null as string | null,
    lastLoser: null as string | null,
    autoFill: false,
    finished: false,
  };

  const newConfig = {
    ...((room.config ?? {}) as Record<string, unknown>),
    outbid: outbidState,
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
