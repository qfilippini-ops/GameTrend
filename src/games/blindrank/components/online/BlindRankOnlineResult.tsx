"use client";

/**
 * Phase "result" de Blind Rank online.
 *
 * Affiche :
 *   - Classement final (1..N) avec les cartes placées
 *   - Vote rejouer / lobby (réutilise `room_replay_votes` + trigger PG existant)
 *
 * Le trigger `process_replay_vote_fn` (schema_replay.sql) gère déjà le reset
 * vers le lobby + auto_start. La salle d'attente Blind Rank consomme le flag
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
import type { BlindRankCard } from "@/types/games";

interface Props {
  room: OnlineRoom;
  myName: string;
  totalPlayers: number;
  replayVotes: ReplayVote[];
  players: RoomPlayer[];
  playerAvatars?: Record<string, string | null>;
}

interface BlindRankFinalState {
  slots: (BlindRankCard | null)[];
  rackSize: number;
  presetId?: string | null;
}

function readState(room: OnlineRoom): BlindRankFinalState | null {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = cfg.blindrank as BlindRankFinalState | undefined;
  if (!s || !Array.isArray(s.slots)) return null;
  return s;
}

export default function BlindRankOnlineResult({
  room,
  myName,
  totalPlayers,
  replayVotes,
  players,
  playerAvatars,
}: Props) {
  const t = useTranslations("games.blindrank.online.result");
  const state = readState(room);
  const [voting, setVoting] = useState(false);

  // Résultat à partager : top du classement + participants (cliquables dans le feed)
  const shareData = useMemo(() => {
    if (!state) return null;
    const ranking = state.slots
      .map((card, idx) => ({ card, position: idx + 1 }))
      .filter((r): r is { card: BlindRankCard; position: number } => r.card !== null);
    const top3 = ranking.slice(0, 3).map((r) => ({
      name: r.card.name,
      position: r.position,
      imageUrl: r.card.imageUrl ?? null,
    }));
    const participants = players.map((p) => ({
      name: p.display_name,
      user_id: p.user_id ?? null,
      avatar_url: playerAvatars?.[p.display_name] ?? null,
    }));
    return {
      rackSize: state.rackSize,
      top3,
      participants,
      online: true,
    };
  }, [state, players, playerAvatars]);

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
    <div className="min-h-screen bg-gradient-to-b from-cyan-950 via-surface-900 to-surface-950 flex flex-col items-center pt-safe px-5">
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
            style={{ textShadow: "0 0 40px rgba(6,182,212,0.4)" }}
          >
            {t("finalRanking")}
          </h1>
        </motion.div>

        {/* Ranking */}
        {state && (
          <div className="space-y-1.5">
            {state.slots.map((card, idx) => {
              const rank = idx + 1;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                    rank === 1
                      ? "border-yellow-600/40 bg-yellow-950/25"
                      : rank === 2
                      ? "border-slate-500/30 bg-slate-900/30"
                      : rank === 3
                      ? "border-orange-700/30 bg-orange-950/20"
                      : "border-surface-700/40 bg-surface-900/40"
                  }`}
                >
                  <span
                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm ${
                      rank === 1
                        ? "bg-yellow-600/30 text-yellow-300"
                        : rank === 2
                        ? "bg-slate-600/30 text-slate-200"
                        : rank === 3
                        ? "bg-orange-700/30 text-orange-300"
                        : "bg-surface-800/60 text-surface-400"
                    }`}
                  >
                    #{rank}
                  </span>
                  {card?.imageUrl && (
                    <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-surface-700/40 shrink-0">
                      <Image
                        src={card.imageUrl}
                        alt={card.name}
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <p className="text-white text-sm font-bold truncate flex-1">
                    {card?.name ?? "—"}
                  </p>
                </motion.div>
              );
            })}
          </div>
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
                className="py-4 rounded-2xl font-display font-bold text-sm bg-gradient-to-r from-cyan-500 to-cyan-600 text-white hover:opacity-92 transition-all disabled:opacity-50"
                style={{ boxShadow: "0 0 20px rgba(6,182,212,0.3)" }}
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
                className="h-full rounded-full bg-cyan-500"
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
                        ? "bg-cyan-950/60 text-cyan-400 border border-cyan-700/30"
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
        {shareData && shareData.top3[0] && (
          <ShareResultButton
            result={{
              gameType: "blindrank",
              presetId: state?.presetId ?? null,
              presetName: null,
              resultData: shareData,
            }}
            shareText={t("shareText", { name: shareData.top3[0].name })}
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
