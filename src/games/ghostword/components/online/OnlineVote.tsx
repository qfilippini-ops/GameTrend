"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { vibrate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/ui/Avatar";
import type { OnlineRoom, RoomPlayer, RoomVote, RoomMessage } from "@/types/rooms";

interface OnlineVoteProps {
  room: OnlineRoom;
  players: RoomPlayer[];
  votes: RoomVote[];
  messages: RoomMessage[];
  myName: string;
  playerAvatars?: Record<string, string | null>;
}

export default function OnlineVote({ room, players, votes, messages, myName, playerAvatars }: OnlineVoteProps) {
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

  const alive = players.filter((p) => !p.is_eliminated);
  const candidates = alive.filter((p) => p.display_name !== myName);

  // Important : ne considérer QUE les votes du round courant.
  // Sinon après un tour de prolongation (vote_round + 1), `myVote` trouverait
  // l'ancien vote et bloquerait le nouveau.
  const currentRoundVotes = votes.filter((v) => v.vote_round === room.vote_round);
  const myVote = currentRoundVotes.find((v) => v.voter_name === myName);
  const votersCount = currentRoundVotes.length;
  const totalAlive = alive.length;

  const tally: Record<string, number> = {};
  currentRoundVotes.forEach((v) => {
    tally[v.target_name] = (tally[v.target_name] ?? 0) + 1;
  });

  const roundMessages = messages.filter((m) => m.vote_round === room.vote_round);
  const msgByPlayer = (name: string) => roundMessages.filter((m) => m.player_name === name);

  async function handleVote() {
    if (!selected || loading) return;
    setLoading(true);
    vibrate([50, 30, 100]);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("room_votes").upsert({
        room_id: room.id,
        voter_name: myName,
        target_name: selected,
        vote_round: room.vote_round,
      });
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col pt-safe relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: "rgba(239,68,68,0.05)" }} />

      <div className="relative z-10 px-4 py-5 flex-1 flex flex-col gap-4">

        {/* Header */}
        <div className="text-center">
          {room.tie_count > 0 ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/12 border border-amber-500/25 text-amber-400 text-xs font-bold mb-2">
              ⚡ Tour de prolongation !
            </div>
          ) : (
            <p className="text-surface-700 text-[10px] uppercase tracking-[0.25em] font-mono mb-2">
              Vote · Round {room.vote_round + 1}
            </p>
          )}
          <h1 className="text-2xl font-display font-black text-white mb-3">Qui élimines-tu ?</h1>

          {/* Progress votes */}
          <div className="flex items-center justify-center gap-2.5">
            <div className="h-1.5 w-28 bg-surface-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-red-500"
                animate={{ width: `${(votersCount / totalAlive) * 100}%` }}
                style={{ boxShadow: "0 0 8px rgba(239,68,68,0.4)" }}
              />
            </div>
            <span className="text-surface-600 text-xs font-mono">{votersCount}/{totalAlive}</span>
          </div>
        </div>

        {!myVote ? (
          /* ── Phase de vote ── */
          <div className="flex flex-col gap-2 flex-1">
            {candidates.map((p) => {
              const msgs = msgByPlayer(p.display_name);
              const isSelected = selected === p.display_name;
              return (
                <motion.button
                  key={p.display_name}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setSelected(p.display_name); vibrate(30); }}
                  className={`w-full text-left rounded-2xl border-2 transition-all overflow-hidden relative ${
                    isSelected
                      ? "border-red-500/50 bg-red-950/20"
                      : "border-surface-700/40 bg-surface-900/50 hover:border-surface-600/50"
                  }`}
                  style={isSelected ? { boxShadow: "0 0 20px rgba(239,68,68,0.15)" } : undefined}
                >
                  {/* Left accent */}
                  {isSelected && (
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-2xl"
                    />
                  )}

                  <div className="p-4">
                    {/* Joueur */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-xl shrink-0 ring-2 transition-all ${isSelected ? "ring-red-500/50" : "ring-transparent"}`}>
                          <Avatar
                            src={playerAvatars?.[p.display_name]}
                            name={p.display_name}
                            size="sm"
                            className="rounded-xl"
                          />
                        </div>
                        <span className="text-white font-semibold text-sm">
                          {p.is_host && "👑 "}{p.display_name}
                        </span>
                      </div>
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="w-6 h-6 rounded-full bg-red-600/30 border border-red-500/40 flex items-center justify-center"
                          >
                            <span className="text-red-400 text-xs font-bold">✗</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Messages */}
                    {msgs.length > 0 ? (
                      <div className="space-y-1 pl-10">
                        {msgs.map((m) => (
                          <p key={m.id} className={`text-xs leading-relaxed ${
                            m.message === "(passe)"
                              ? "text-surface-700 italic"
                              : "text-surface-400"
                          }`}>
                            {m.message === "(passe)" ? "— a passé" : `"${m.message}"`}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-surface-800 italic pl-10">Aucun message ce tour</p>
                    )}
                  </div>
                </motion.button>
              );
            })}

            <button
              onClick={handleVote}
              disabled={!selected || loading}
              className={`w-full py-5 rounded-2xl font-display font-bold text-lg mt-1 transition-all ${
                selected
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-surface-800/60 text-surface-700 cursor-not-allowed border border-surface-700/30"
              }`}
              style={selected ? { boxShadow: "0 0 24px rgba(239,68,68,0.3)" } : undefined}
            >
              {loading ? "Envoi…" : "Confirmer mon vote ⚡"}
            </button>
          </div>

        ) : (
          /* ── En attente ── */
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center py-6 rounded-2xl border border-surface-700/40 bg-surface-900/50">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-white font-semibold text-sm">Vote enregistré</p>
                <p className="text-surface-500 text-xs mt-1">
                  Tu as voté contre <span className="text-red-300 font-medium">{myVote.target_name}</span>
                </p>
                <div className="flex items-center justify-center gap-2 mt-3 text-surface-700 text-xs">
                  <div className="w-3 h-3 rounded-full border-2 border-surface-700 border-t-transparent animate-spin" />
                  En attente… ({votersCount}/{totalAlive})
                </div>
              </div>

              {votersCount >= totalAlive && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  <p className="text-surface-500 text-xs uppercase tracking-widest text-center font-mono">Résultats</p>
                  {Object.entries(tally).sort(([, a], [, b]) => b - a).map(([name, count]) => (
                    <div key={name} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-surface-700/40 bg-surface-900/60">
                      <span className="text-white font-medium text-sm flex-1">{name}</span>
                      <span className="text-red-400 font-bold font-mono text-sm">{count}v</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
