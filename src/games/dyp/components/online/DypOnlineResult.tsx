"use client";

/**
 * Phase "result" de DYP online.
 *
 * Affiche :
 *   - Champion (1ère place)
 *   - Bracket complet : tous les rounds avec leurs winners
 *   - Vote rejouer / lobby (réutilise `room_replay_votes` + trigger PG existant)
 *   - Bouton de partage (avec participants cliquables dans le feed)
 *
 * Le trigger `process_replay_vote_fn` (schema_replay.sql) gère déjà le reset
 * vers le lobby + auto_start. La salle d'attente DYP consomme le flag
 * `auto_start` pour relancer la partie automatiquement.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import ShareResultButton from "@/components/social/ShareResultButton";
import type { OnlineRoom, ReplayVote, RoomPlayer } from "@/types/rooms";
import type { DYPCard } from "@/types/games";

interface Props {
  room: OnlineRoom;
  myName: string;
  totalPlayers: number;
  replayVotes: ReplayVote[];
  players: RoomPlayer[];
  playerAvatars?: Record<string, string | null>;
}

interface DypMatch {
  matchId: string;
  card1Id: string;
  card2Id: string;
  winnerId: string | null;
}

interface DypFinalState {
  presetId?: string | null;
  bracketSize: number;
  cards: DYPCard[];
  totalRounds: number;
  bracket: DypMatch[][];
  championId: string | null;
}

function readState(room: OnlineRoom): DypFinalState | null {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = cfg.dyp as DypFinalState | undefined;
  if (!s || !Array.isArray(s.bracket)) return null;
  return s;
}

export default function DypOnlineResult({
  room,
  myName,
  totalPlayers,
  replayVotes,
  players,
  playerAvatars,
}: Props) {
  const t = useTranslations("games.dyp.online.result");
  const state = readState(room);
  const [voting, setVoting] = useState(false);

  const cardById = useMemo(() => {
    const map = new Map<string, DYPCard>();
    state?.cards.forEach((c) => map.set(c.id, c));
    return map;
  }, [state]);

  const champion = state?.championId ? cardById.get(state.championId) ?? null : null;

  // Données pour partage : champion + participants
  const shareData = useMemo(() => {
    if (!state || !champion) return null;
    const participants = players.map((p) => ({
      name: p.display_name,
      user_id: p.user_id ?? null,
      avatar_url: playerAvatars?.[p.display_name] ?? null,
    }));
    return {
      bracketSize: state.bracketSize,
      champion: {
        name: champion.name,
        imageUrl: champion.imageUrl ?? null,
      },
      participants,
      online: true,
    };
  }, [state, champion, players, playerAvatars]);

  useEffect(() => {
    vibrate([80, 60, 200]);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-950 via-surface-900 to-surface-950 flex flex-col items-center pt-safe px-5">
      <div className="w-full max-w-sm py-6 space-y-5">
        {/* Trophy */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="text-center pt-2"
        >
          <div className="text-6xl mb-4 animate-float">🏆</div>
          <p className="text-surface-600 text-[10px] uppercase tracking-[0.25em] mb-1.5">
            {t("gameOver")}
          </p>
          <h1
            className="text-3xl font-display font-black text-white mb-2"
            style={{ textShadow: "0 0 40px rgba(245,158,11,0.4)" }}
          >
            {t("champion")}
          </h1>
        </motion.div>

        {/* Champion card */}
        {champion && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 180, damping: 18 }}
            className="rounded-3xl border border-amber-600/40 bg-gradient-to-br from-amber-950/40 via-surface-900 to-amber-950/30 overflow-hidden"
            style={{ boxShadow: "0 0 40px rgba(245,158,11,0.2)" }}
          >
            {champion.imageUrl ? (
              <div className="relative w-full aspect-square">
                <Image
                  src={champion.imageUrl}
                  alt={champion.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 384px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-amber-950/60 flex items-center justify-center">
                <span className="text-7xl">⚡</span>
              </div>
            )}
            <div className="px-4 py-3 text-center">
              <span className="text-amber-400/70 text-[10px] uppercase tracking-widest">
                🥇 {t("winner")}
              </span>
              <p className="text-white font-display font-black text-2xl mt-1">
                {champion.name}
              </p>
            </div>
          </motion.div>
        )}

        {/* Bracket — toutes les manches */}
        {state && state.bracket.length > 0 && (
          <details className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
            <summary className="px-4 py-3 cursor-pointer text-white font-display font-bold text-sm flex items-center justify-between">
              <span>{t("bracketTitle")}</span>
              <span className="text-surface-500 text-xs font-mono">
                {state.bracket.length} rounds
              </span>
            </summary>
            <div className="border-t border-surface-800/40 divide-y divide-surface-800/30">
              {state.bracket.map((roundMatches, roundIdx) => {
                const isFinal = roundIdx === state.bracket.length - 1;
                return (
                  <div key={roundIdx} className="px-3 py-2.5">
                    <p className="text-amber-400/70 text-[10px] uppercase tracking-widest font-mono mb-1.5">
                      {isFinal
                        ? t("finalRound")
                        : t("roundN", { n: roundIdx + 1 })}
                    </p>
                    <div className="space-y-1.5">
                      {roundMatches.map((m) => {
                        const c1 = cardById.get(m.card1Id);
                        const c2 = cardById.get(m.card2Id);
                        return (
                          <div
                            key={m.matchId}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span
                              className={`flex-1 truncate ${
                                m.winnerId === m.card1Id
                                  ? "text-amber-300 font-bold"
                                  : "text-surface-600 line-through"
                              }`}
                            >
                              {c1?.name ?? "?"}
                            </span>
                            <span className="text-surface-700 text-[10px] font-mono shrink-0">
                              vs
                            </span>
                            <span
                              className={`flex-1 truncate text-right ${
                                m.winnerId === m.card2Id
                                  ? "text-amber-300 font-bold"
                                  : "text-surface-600 line-through"
                              }`}
                            >
                              {c2?.name ?? "?"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

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
          <p className="text-surface-700 text-[10px] text-center">{t("tip")}</p>
        </div>

        {/* Partage du résultat (feed + Web Share API) */}
        {shareData && (
          <ShareResultButton
            result={{
              gameType: "dyp",
              presetId: state?.presetId ?? null,
              presetName: null,
              resultData: shareData,
            }}
            shareText={t("shareText", { name: shareData.champion.name })}
            shareUrl={
              state?.presetId
                ? `${typeof window !== "undefined" ? window.location.origin : ""}/presets/${state.presetId}`
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
