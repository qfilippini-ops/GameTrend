"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { vibrate } from "@/lib/utils";
import { getRoomResults, type RoomResultData } from "@/app/actions/rooms";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/ui/Avatar";
import type { ReplayVote } from "@/types/rooms";

interface OnlineResultProps {
  roomId: string;
  winner: string;
  myName: string;
  totalPlayers: number;
  replayVotes: ReplayVote[];
  playerAvatars?: Record<string, string | null>;
}

const ROLE_LABELS: Record<string, string> = { initie: "Initié", ombre: "Ombre", vide: "Fantôme" };
const ROLE_STYLES: Record<string, { border: string; bg: string; badge: string; dot: string }> = {
  initie: {
    border: "border-brand-700/25",
    bg: "bg-brand-950/25",
    badge: "bg-brand-900/50 text-brand-300 border-brand-700/30",
    dot: "bg-brand-500",
  },
  ombre: {
    border: "border-ghost-700/25",
    bg: "bg-ghost-950/25",
    badge: "bg-ghost-900/50 text-ghost-300 border-ghost-700/30",
    dot: "bg-ghost-500",
  },
  vide: {
    border: "border-surface-700/25",
    bg: "bg-surface-900/25",
    badge: "bg-surface-800/50 text-surface-400 border-surface-700/30",
    dot: "bg-surface-500",
  },
};

export default function OnlineResult({ roomId, winner, myName, totalPlayers, replayVotes, playerAvatars }: OnlineResultProps) {
  const [data, setData] = useState<RoomResultData | null>(null);
  const [voting, setVoting] = useState(false);
  const [showVotes, setShowVotes] = useState(false);

  useEffect(() => {
    vibrate([80, 60, 200]);
    getRoomResults(roomId).then((res) => {
      if (!("error" in res)) setData(res);
    });
  }, [roomId]);

  const myVote = replayVotes.find((v) => v.player_name === myName);
  const replayCount = replayVotes.filter((v) => v.choice === "replay").length;

  const winnerLabel = winner === "ombre" ? "L'Ombre" : winner === "vide" ? "Le Fantôme" : "Les Initiés";
  const myRole = data?.players.find((p) => p.displayName === myName)?.role ?? "initie";
  const iWon = winner === "initie" ? myRole === "initie" : myRole !== "initie";

  const winnerEmoji = winner === "ombre" ? "🕵️" : winner === "vide" ? "👻" : "🎉";
  const winnerGlow = winner === "ombre"
    ? "rgba(68,96,255,0.5)"
    : winner === "vide"
    ? "rgba(217,70,239,0.5)"
    : "rgba(52,211,153,0.5)";
  const gradients: Record<string, string> = {
    ombre:  "from-brand-950 via-surface-900 to-surface-950",
    vide:   "from-ghost-950 via-surface-900 to-surface-950",
    initie: "from-emerald-950 via-surface-900 to-surface-950",
  };

  async function castReplayVote(choice: "replay" | "lobby") {
    if (myVote || voting) return;
    setVoting(true);
    vibrate(50);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("room_replay_votes").upsert({ room_id: roomId, player_name: myName, choice });
    }
    setVoting(false);
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b ${gradients[winner] ?? gradients.initie} flex flex-col items-center pt-safe px-5`}>
      <div className="w-full max-w-sm py-6 space-y-5">

        {/* ── Winner ── */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="text-center pt-2"
        >
          <div className="text-6xl mb-4 animate-float">{winnerEmoji}</div>
          <p className="text-surface-600 text-[10px] uppercase tracking-[0.25em] mb-1.5">Partie terminée</p>
          <h1
            className="text-4xl font-display font-black text-white mb-2"
            style={{ textShadow: `0 0 40px ${winnerGlow}` }}
          >
            {winnerLabel} gagne !
          </h1>
          <p className={`text-sm font-medium ${iWon ? "text-emerald-400" : "text-surface-600"}`}>
            {iWon ? "Tu fais partie des vainqueurs 🏆" : "Mieux la prochaine fois…"}
          </p>
        </motion.div>

        {/* ── Révélation des rôles ── */}
        {data && (
          <div className="space-y-2">
            <p className="text-surface-700 text-[10px] uppercase tracking-widest text-center font-mono">Rôles révélés</p>
            {data.players.map((p, i) => {
              const style = ROLE_STYLES[p.role] ?? ROLE_STYLES.initie;
              return (
                <motion.div
                  key={p.displayName}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.07 * i }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.border} ${style.bg} relative overflow-hidden`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                  <Avatar
                    src={playerAvatars?.[p.displayName]}
                    name={p.displayName}
                    size="sm"
                    className="rounded-lg shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${p.displayName === myName ? "text-white" : "text-surface-200"}`}>
                      {p.displayName}{p.displayName === myName && <span className="text-surface-600 text-xs ml-1">(toi)</span>}
                      {p.isEliminated && <span className="text-surface-700 text-xs ml-1.5">éliminé</span>}
                    </p>
                    {p.word && <p className="text-surface-600 text-xs mt-0.5 truncate">"{p.word}"</p>}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${style.badge}`}>
                    {ROLE_LABELS[p.role] ?? p.role}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Historique votes (accordéon) ── */}
        {data && data.voteRounds.length > 0 && (
          <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
            <button
              onClick={() => setShowVotes(!showVotes)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800/30 transition-colors"
            >
              <span className="text-white font-display font-bold text-sm">🗳 Historique des votes</span>
              <span className="text-surface-600 text-xs transition-transform" style={{ transform: showVotes ? "rotate(180deg)" : "none" }}>▼</span>
            </button>

            <AnimatePresence>
              {showVotes && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-surface-800/40"
                >
                  <div className="px-4 py-4 space-y-5">
                    {data.voteRounds.map(({ round, votes, eliminated, wasTie }) => {
                      const tally: Record<string, string[]> = {};
                      votes.forEach((v) => {
                        if (!tally[v.target]) tally[v.target] = [];
                        tally[v.target].push(v.voter);
                      });
                      return (
                        <div key={round}>
                          <div className="flex items-center gap-2 mb-3">
                            <p className="text-surface-600 text-[10px] uppercase tracking-widest font-mono">Vote {round + 1}</p>
                            {wasTie ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-950/50 text-amber-400 border border-amber-700/30">Égalité</span>
                            ) : eliminated ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-950/50 text-red-400 border border-red-700/30">
                                ☠ {eliminated}
                              </span>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            {Object.entries(tally).sort(([, a], [, b]) => b.length - a.length).map(([target, voters]) => {
                              const pct = Math.round((voters.length / votes.length) * 100);
                              const isElim = target === eliminated;
                              return (
                                <div key={target}>
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className={`font-medium ${isElim ? "text-red-300" : "text-surface-400"}`}>
                                      {isElim && "☠ "}{target}
                                    </span>
                                    <span className="text-surface-600">{voters.length}v</span>
                                  </div>
                                  <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden mb-1">
                                    <motion.div
                                      className={`h-full rounded-full ${isElim ? "bg-red-500" : "bg-surface-600"}`}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${pct}%` }}
                                      transition={{ duration: 0.5, delay: 0.1 }}
                                    />
                                  </div>
                                  <p className="text-surface-700 text-xs pl-1">
                                    ← {voters.map((v, idx) => (
                                      <span key={v}>
                                        <span className={v === myName ? "text-brand-400 font-medium" : ""}>{v}</span>
                                        {idx < voters.length - 1 && <span className="text-surface-800">, </span>}
                                      </span>
                                    ))}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Zone Rejouer / Lobby ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3">
          <p className="text-white font-display font-bold text-sm text-center">Et maintenant ?</p>

          {!myVote ? (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => castReplayVote("replay")}
                disabled={voting}
                className="py-4 rounded-2xl font-display font-bold text-sm bg-gradient-brand text-white glow-brand hover:opacity-92 transition-all disabled:opacity-50"
              >
                🔄 Rejouer
              </button>
              <button
                onClick={() => castReplayVote("lobby")}
                disabled={voting}
                className="py-4 rounded-2xl font-display font-bold text-sm border border-surface-600/50 bg-surface-800/60 text-surface-200 hover:border-surface-500/60 transition-all disabled:opacity-50"
              >
                🏠 Lobby
              </button>
            </div>
          ) : (
            <p className="text-surface-500 text-sm text-center py-1">
              {myVote.choice === "replay" ? "Tu veux rejouer 🔄" : "Tu retournes au lobby 🏠"}
              <span className="text-surface-700"> — En attente…</span>
            </p>
          )}

          {/* Jauge rejouer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-surface-700">
              <span>🔄 Rejouer</span>
              <span className="font-mono">{replayCount}/{totalPlayers}</span>
            </div>
            <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-brand"
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
                        ? "bg-brand-950/60 text-brand-400 border border-brand-700/30"
                        : "bg-surface-800/60 text-surface-500 border border-surface-700/30"
                    }`}
                  >
                    {v.player_name} {v.choice === "replay" ? "🔄" : "🏠"}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-surface-700 text-[10px] text-center">
            Un seul "Lobby" renvoie tout le monde. Tous "Rejouer" relance la partie.
          </p>
        </div>

      </div>
    </div>
  );
}
