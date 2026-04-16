"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { castVote, continueToNextRound, getFinalRankings } from "@/games/dyp/engine";
import type { DYPGameState, DYPCard } from "@/types/games";

const GAME_KEY = "dyp:current_game";

function loadState(): DYPGameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GAME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state: DYPGameState) {
  localStorage.setItem(GAME_KEY, JSON.stringify(state));
}

async function saveResults(state: DYPGameState) {
  if (!state.presetId) return;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const rankings = getFinalRankings(state);
    await supabase.from("dyp_results").insert({
      preset_id: state.presetId,
      bracket_size: state.bracketSize,
      rankings: rankings.map((r) => ({
        card_id: r.card.id,
        card_name: r.card.name,
        image_url: r.card.imageUrl ?? null,
        position: r.position,
      })),
      player_id: user?.id ?? null,
    });
    await supabase.rpc("increment_preset_play_count", { p_preset_id: state.presetId });
  } catch {
    // silencieux
  }
}

// ── Composant carte ─────────────────────────────────────────────

function DuelCard({
  card,
  side,
  voteState,
  onClick,
}: {
  card: DYPCard;
  side: "left" | "right";
  voteState: "left" | "right" | null;
  onClick: () => void;
}) {
  const isWinner = voteState === side;
  const isLoser = voteState !== null && voteState !== side;

  return (
    <motion.button
      onClick={onClick}
      disabled={voteState !== null}
      animate={{
        scale: isWinner ? 1.05 : isLoser ? 0.88 : 1,
        opacity: isLoser ? 0 : 1,
        y: isLoser ? 16 : 0,
      }}
      transition={{ duration: 0.38, ease: "easeInOut" }}
      className={`relative rounded-2xl overflow-hidden cursor-pointer shrink-0
        w-full aspect-square max-w-[260px] mx-auto
        transition-shadow
        ${isWinner
          ? "ring-2 ring-amber-400/80"
          : "ring-1 ring-surface-700/40 hover:ring-amber-600/40"
        }`}
      style={{
        boxShadow: isWinner
          ? "0 0 32px rgba(245,158,11,0.5)"
          : "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {card.imageUrl ? (
        <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-surface-900 to-brand-900/70" />
      )}

      {/* Gradient footer */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

      {/* Nom */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="font-display font-bold text-white text-lg leading-tight drop-shadow-lg line-clamp-2">
          {card.name}
        </p>
      </div>

      {/* Couronne gagnant */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 300 }}
          className="absolute top-3 right-3"
        >
          <span className="text-4xl drop-shadow-2xl">⭐</span>
        </motion.div>
      )}

      {/* Hover hint */}
      {voteState === null && (
        <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-colors pointer-events-none" />
      )}
    </motion.button>
  );
}

// ── Page principale ─────────────────────────────────────────────

export default function DYPPlayPage() {
  const router = useRouter();
  const [state, setState] = useState<DYPGameState | null>(null);
  const [voteState, setVoteState] = useState<"left" | "right" | null>(null);
  const [resultsSaved, setResultsSaved] = useState(false);
  const saveOnce = useRef(false);

  useEffect(() => {
    const loaded = loadState();
    if (!loaded) { router.replace("/games/dyp"); return; }
    setState(loaded);
  }, [router]);

  useEffect(() => {
    if (state?.phase === "result" && !saveOnce.current) {
      saveOnce.current = true;
      saveResults(state).then(() => setResultsSaved(true));
    }
  }, [state]);

  function handleVote(side: "left" | "right") {
    if (!state || voteState !== null || state.phase !== "duel") return;
    setVoteState(side);
    const match = state.matches[state.currentMatchIndex];
    const winnerId = side === "left" ? match.card1.id : match.card2.id;
    setTimeout(() => {
      const newState = castVote(state, winnerId);
      saveState(newState);
      setState(newState);
      setVoteState(null);
    }, 500);
  }

  function handleContinue() {
    if (!state) return;
    const newState = continueToNextRound(state);
    saveState(newState);
    setState(newState);
  }

  function handleReplay() {
    localStorage.removeItem(GAME_KEY);
    router.push("/games/dyp");
  }

  if (!state) return null;

  const match = state.phase === "duel" ? state.matches[state.currentMatchIndex] : null;

  // ── Écran de transition entre rounds ─────────────────────────
  if (state.phase === "round_transition") {
    const advancing = state.matches.length * 2;
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-6 py-safe">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="w-full max-w-xs space-y-6 text-center"
        >
          {/* Icon */}
          <div className="text-6xl animate-float">⚡</div>

          {/* Titre */}
          <div className="space-y-1">
            <p className="text-surface-500 text-xs uppercase tracking-[0.2em] font-mono">
              Round {state.currentRound - 1} terminé
            </p>
            <h2 className="font-display font-black text-white text-4xl">
              {advancing} restent
            </h2>
          </div>

          {/* Info round suivant */}
          <div
            className="rounded-2xl border border-amber-700/20 bg-amber-950/30 px-5 py-4 space-y-1"
            style={{ boxShadow: "0 0 24px rgba(245,158,11,0.08)" }}
          >
            <p className="text-amber-300/80 text-sm font-medium">
              Round {state.currentRound} / {state.totalRounds}
            </p>
            <p className="text-surface-500 text-xs">
              {state.matches.length} duel{state.matches.length > 1 ? "s" : ""} à venir
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleContinue}
            className="w-full py-4 rounded-2xl font-display font-bold text-lg text-white"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              boxShadow: "0 0 24px rgba(245,158,11,0.3)",
            }}
          >
            Continuer →
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── Écran de résultat ─────────────────────────────────────────
  if (state.phase === "result" && state.champion) {
    const rankings = getFinalRankings(state);
    const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
    const top3 = rankings.slice(0, 3);
    const rest = rankings.slice(3);

    return (
      <div
        className="min-h-screen px-4 py-safe"
        style={{ background: "linear-gradient(to bottom, rgba(120,53,15,0.25), #09090b 40%)" }}
      >
        <div className="max-w-sm mx-auto py-6 space-y-5">

          {/* Champion */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="text-center space-y-3"
          >
            <p className="text-amber-500/60 text-[10px] uppercase tracking-[0.25em] font-mono">
              Champion du tournoi
            </p>
            <div className="text-6xl animate-float">🏆</div>
            <h1
              className="text-5xl font-display font-black text-white leading-tight"
              style={{ textShadow: "0 0 40px rgba(245,158,11,0.6)" }}
            >
              {state.champion.name}
            </h1>
            {state.champion.imageUrl && (
              <div
                className="relative mx-auto w-52 h-52 rounded-3xl overflow-hidden"
                style={{
                  border: "2px solid rgba(245,158,11,0.4)",
                  boxShadow: "0 0 40px rgba(245,158,11,0.25)",
                }}
              >
                <Image src={state.champion.imageUrl} alt={state.champion.name} fill className="object-cover" unoptimized />
              </div>
            )}
          </motion.div>

          {/* Podium top 3 */}
          {top3.length > 0 && (
            <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-800/50">
                <p className="text-white font-display font-bold text-sm">Podium</p>
              </div>
              <div className="divide-y divide-surface-800/30">
                {top3.map(({ card, position }, i) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span className="text-xl shrink-0">{medals[position]}</span>
                    {card.imageUrl ? (
                      <div className="relative w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-surface-700/30">
                        <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-surface-800/60 shrink-0" />
                    )}
                    <span className={`flex-1 text-sm font-medium ${position === 1 ? "text-amber-300" : "text-surface-200"}`}>
                      {card.name}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Reste du classement */}
          {rest.length > 0 && (
            <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-800/50">
                <p className="text-surface-400 font-display font-bold text-sm">Suite du classement</p>
              </div>
              <div className="divide-y divide-surface-800/20 max-h-52 overflow-y-auto">
                {rest.map(({ card, position }, i) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + i * 0.03 }}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    {card.imageUrl ? (
                      <div className="relative w-7 h-7 rounded-lg overflow-hidden shrink-0">
                        <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-surface-800/60 shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-surface-400">{card.name}</span>
                    <span className="text-xs text-surface-600 font-mono">#{position}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleReplay}
              className="py-4 rounded-2xl font-display font-bold text-sm text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                boxShadow: "0 0 18px rgba(245,158,11,0.25)",
              }}
            >
              🔄 Rejouer
            </button>
            <button
              onClick={() => { localStorage.removeItem(GAME_KEY); router.push("/"); }}
              className="py-4 rounded-2xl border border-surface-700/40 bg-surface-800/50 text-surface-300 font-display font-bold text-sm hover:border-surface-600/60 hover:text-white transition-all"
            >
              🏠 Accueil
            </button>
          </div>

          {state.presetId && (
            <button
              onClick={() => { localStorage.removeItem(GAME_KEY); router.push(`/presets/${state.presetId}`); }}
              className="w-full py-3 rounded-2xl border border-amber-700/30 bg-amber-950/20 text-amber-400/80 font-semibold text-sm hover:border-amber-600/50 hover:bg-amber-950/40 hover:text-amber-300 transition-all"
            >
              📋 Voir le preset
            </button>
          )}

          {state.presetId && !resultsSaved && (
            <p className="text-surface-700 text-xs text-center">Sauvegarde des stats…</p>
          )}

        </div>
      </div>
    );
  }

  // ── Écran de duel ─────────────────────────────────────────────
  if (!match) return null;

  const totalMatches = state.matches.length;
  const progress = totalMatches > 0 ? state.currentMatchIndex / totalMatches : 0;

  return (
    <div className="h-screen bg-surface-950 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-4 pt-safe pt-3 pb-2 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { localStorage.removeItem(GAME_KEY); router.push("/games/dyp"); }}
            className="text-surface-600 hover:text-surface-400 text-sm transition-colors font-medium"
          >
            ← Quitter
          </button>
          <div className="text-center">
            <p className="text-surface-300 text-xs font-mono font-bold">
              Round {state.currentRound}/{state.totalRounds}
            </p>
            <p className="text-surface-600 text-[10px]">
              Duel {state.currentMatchIndex + 1}/{totalMatches}
            </p>
          </div>
          <div className="w-16" />
        </div>

        {/* Barre de progression */}
        <div className="h-1 bg-surface-800/60 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-amber-500/70"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Zone de duel */}
      <div className="flex-1 flex items-center justify-center px-5 py-2 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${state.currentRound}-${state.currentMatchIndex}`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-xs flex flex-col items-center gap-3"
          >
            <DuelCard
              card={match.card1}
              side="left"
              voteState={voteState}
              onClick={() => handleVote("left")}
            />

            {/* VS badge */}
            <div className="shrink-0 flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-surface-800/60" />
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-surface-700/40 bg-surface-900"
                style={{ boxShadow: "0 0 12px rgba(0,0,0,0.5)" }}
              >
                <span className="text-surface-500 text-[10px] font-black tracking-tight">VS</span>
              </div>
              <div className="flex-1 h-px bg-surface-800/60" />
            </div>

            <DuelCard
              card={match.card2}
              side="right"
              voteState={voteState}
              onClick={() => handleVote("right")}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Instruction */}
      <div className="text-center pb-safe pb-5 shrink-0">
        <p className="text-surface-700 text-xs">Tape sur ta carte préférée</p>
      </div>

    </div>
  );
}
