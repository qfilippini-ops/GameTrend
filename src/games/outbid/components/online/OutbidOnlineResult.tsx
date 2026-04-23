"use client";

/**
 * Phase "result" de Outbid online (1v1).
 *
 * Affiche les 2 équipes côte à côte (Joueur A | Joueur B) avec :
 *   - Avatar + nom + points restants + total dépensé
 *   - Toutes les cartes acquises avec leur prix
 * Pas de gagnant déclaré : les joueurs jugent eux-mêmes.
 *
 * Inclut le mécanisme de replay vote (réutilisé tel quel) et un bouton
 * de partage public.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import ShareResultButton from "@/components/social/ShareResultButton";
import { OUTBID_STARTING_POINTS } from "@/games/outbid/online-config";
import type { OnlineRoom, ReplayVote, RoomPlayer } from "@/types/rooms";
import type { DYPCard } from "@/types/games";

interface OutbidPlayerFinal {
  name: string;
  points: number;
  team: Array<{ cardId: string; price: number }>;
}

interface OutbidFinalState {
  presetId: string | null;
  teamSize: number;
  cards: DYPCard[];
  playerA: OutbidPlayerFinal;
  playerB: OutbidPlayerFinal;
  finished: boolean;
  autoFill: boolean;
}

interface Props {
  room: OnlineRoom;
  myName: string;
  totalPlayers: number;
  replayVotes: ReplayVote[];
  players: RoomPlayer[];
  playerAvatars?: Record<string, string | null>;
}

function readState(room: OnlineRoom): OutbidFinalState | null {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = cfg.outbid as OutbidFinalState | undefined;
  if (!s || !s.playerA || !s.playerB) return null;
  return s;
}

export default function OutbidOnlineResult({
  room,
  myName,
  totalPlayers,
  replayVotes,
  players,
  playerAvatars,
}: Props) {
  const t = useTranslations("games.outbid.online.result");
  const state = readState(room);
  const [voting, setVoting] = useState(false);

  const cardById = useMemo(() => {
    const map = new Map<string, DYPCard>();
    state?.cards.forEach((c) => map.set(c.id, c));
    return map;
  }, [state]);

  useEffect(() => {
    vibrate([60, 40, 120]);
  }, []);

  const myVote = replayVotes.find((v) => v.player_name === myName);
  const replayCount = replayVotes.filter((v) => v.choice === "replay").length;

  async function castReplayVote(choice: "replay" | "lobby") {
    if (myVote || voting) return;
    setVoting(true);
    vibrate(50);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("room_replay_votes")
        .upsert({ room_id: room.id, player_name: myName, choice });
    }
    setVoting(false);
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm">{t("loading")}</p>
      </div>
    );
  }

  // Données pour partage
  const shareData = {
    teamSize: state.teamSize,
    playerA: {
      name: state.playerA.name,
      points: state.playerA.points,
      team: state.playerA.team
        .map((e) => {
          const c = cardById.get(e.cardId);
          return c
            ? { name: c.name, imageUrl: c.imageUrl ?? null, price: e.price }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    },
    playerB: {
      name: state.playerB.name,
      points: state.playerB.points,
      team: state.playerB.team
        .map((e) => {
          const c = cardById.get(e.cardId);
          return c
            ? { name: c.name, imageUrl: c.imageUrl ?? null, price: e.price }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    },
    participants: players.map((p) => ({
      name: p.display_name,
      user_id: p.user_id ?? null,
      avatar_url: playerAvatars?.[p.display_name] ?? null,
    })),
    online: true,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-950 via-surface-900 to-surface-950 flex flex-col items-center pt-safe px-4 pb-8">
      <div className="w-full max-w-2xl py-6 space-y-5">
        {/* Header */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="text-center"
        >
          <div className="text-5xl mb-3 animate-float">🪙</div>
          <p className="text-surface-600 text-[10px] uppercase tracking-[0.25em] mb-1.5">
            {t("gameOver")}
          </p>
          <h1
            className="text-2xl sm:text-3xl font-display font-black text-white mb-1"
            style={{ textShadow: "0 0 40px rgba(245,158,11,0.4)" }}
          >
            {t("title")}
          </h1>
          <p className="text-surface-500 text-xs">{t("subtitle")}</p>
        </motion.div>

        {/* Deux équipes côte à côte */}
        <div className="grid grid-cols-2 gap-3">
          <TeamColumn
            player={state.playerA}
            cardById={cardById}
            avatar={playerAvatars?.[state.playerA.name] ?? null}
            isYou={state.playerA.name === myName}
            t={t}
          />
          <TeamColumn
            player={state.playerB}
            cardById={cardById}
            avatar={playerAvatars?.[state.playerB.name] ?? null}
            isYou={state.playerB.name === myName}
            t={t}
          />
        </div>

        {/* Replay zone */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3">
          <p className="text-white font-display font-bold text-sm text-center">
            {t("andNow")}
          </p>

          {!myVote ? (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => castReplayVote("replay")}
                disabled={voting}
                className="py-4 rounded-2xl font-display font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-92 transition-all disabled:opacity-50"
                style={{ boxShadow: "0 0 20px rgba(245,158,11,0.3)" }}
              >
                {t("replay")}
              </button>
              <button
                onClick={() => castReplayVote("lobby")}
                disabled={voting}
                className="py-4 rounded-2xl font-display font-bold text-sm border border-surface-600/50 bg-surface-800/60 text-surface-200 hover:border-surface-500/60 transition-all disabled:opacity-50"
              >
                {t("lobby")}
              </button>
            </div>
          ) : (
            <p className="text-surface-500 text-sm text-center py-1">
              {myVote.choice === "replay" ? t("wantsReplay") : t("wantsLobby")}
              <span className="text-surface-700">{t("waitingChoice")}</span>
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-surface-700">
              <span>{t("replayLabel")}</span>
              <span className="font-mono">
                {replayCount}/{totalPlayers}
              </span>
            </div>
            <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-amber-500"
                animate={{ width: `${(replayCount / totalPlayers) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            {replayVotes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {replayVotes.map((v) => (
                  <span
                    key={v.player_name}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                      v.choice === "replay"
                        ? "bg-amber-950/60 text-amber-400 border border-amber-700/30"
                        : "bg-surface-800/60 text-surface-500 border border-surface-700/30"
                    }`}
                  >
                    {v.player_name} {v.choice === "replay" ? "🔄" : "🏠"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Partage du résultat */}
        <ShareResultButton
          result={{
            gameType: "outbid",
            presetId: state.presetId ?? null,
            presetName: null,
            resultData: shareData,
          }}
          shareText={t("shareText", {
            a: state.playerA.name,
            b: state.playerB.name,
          })}
          shareUrl={
            state.presetId
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/presets/${state.presetId}`
              : undefined
          }
        />
      </div>
    </div>
  );
}

// ── Sous-composant : colonne équipe ──────────────────────────────────────
function TeamColumn({
  player,
  cardById,
  avatar,
  isYou,
  t,
}: {
  player: OutbidPlayerFinal;
  cardById: Map<string, DYPCard>;
  avatar: string | null;
  isYou: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const totalSpent = player.team.reduce((sum, c) => sum + c.price, 0);
  return (
    <div className="rounded-2xl border border-amber-700/30 bg-gradient-to-b from-amber-950/30 via-surface-900/60 to-surface-950 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-amber-800/30 flex items-center gap-2">
        <div className="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-amber-600/50 shrink-0">
          {avatar ? (
            <Image
              src={avatar}
              alt={player.name}
              fill
              sizes="32px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-600 to-ghost-600 flex items-center justify-center text-white text-xs font-bold">
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white text-xs font-bold truncate">
            {isYou ? `${player.name} (${t("you")})` : player.name}
          </p>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-amber-400 font-bold">
              {player.points} pts
            </span>
            <span className="text-surface-700">·</span>
            <span className="text-surface-500">
              −{OUTBID_STARTING_POINTS - player.points}
            </span>
          </div>
        </div>
      </div>

      {/* Liste des cartes */}
      <div className="p-2 grid grid-cols-2 gap-1.5 max-h-96 overflow-y-auto">
        {player.team.length === 0 ? (
          <p className="col-span-2 text-surface-700 text-xs text-center py-4 italic">
            {t("emptyTeam")}
          </p>
        ) : (
          player.team.map((entry, i) => {
            const card = cardById.get(entry.cardId);
            if (!card) return null;
            return (
              <div
                key={`${entry.cardId}-${i}`}
                className="relative rounded-md overflow-hidden ring-1 ring-amber-700/40 aspect-[3/4]"
                title={`${card.name} — ${entry.price} pts`}
              >
                {card.imageUrl ? (
                  <Image
                    src={card.imageUrl}
                    alt={card.name}
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-amber-900/60 to-surface-900" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-1 pt-3 pb-1">
                  <p className="text-white text-[9px] font-bold leading-tight line-clamp-1">
                    {card.name}
                  </p>
                  <p className="text-amber-300 text-[10px] font-mono font-bold">
                    {entry.price === 0 ? t("freePrice") : `${entry.price}`}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer total */}
      <div className="px-3 py-1.5 border-t border-surface-800/40 bg-surface-950/60 text-[10px] font-mono flex justify-between">
        <span className="text-surface-500">
          {t("cardsCount", { n: player.team.length })}
        </span>
        <span className="text-amber-400 font-bold">
          {t("totalSpent", { amount: totalSpent })}
        </span>
      </div>
    </div>
  );
}
