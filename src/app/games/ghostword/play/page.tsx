"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import VeilScreen from "@/games/ghostword/components/VeilScreen";
import RevealScreen from "@/games/ghostword/components/RevealScreen";
import DiscussionScreen from "@/games/ghostword/components/DiscussionScreen";
import VoteScreen from "@/games/ghostword/components/VoteScreen";
import ResultScreen from "@/games/ghostword/components/ResultScreen";
import {
  createGame,
  nextPhase,
  eliminatePlayer,
  DEFAULT_CONFIG,
} from "@/games/ghostword/engine";
import { createClient } from "@/lib/supabase/client";
import type { GhostWordGameState, GhostWordConfig } from "@/types/games";

function GhostWordPlayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gameState, setGameState] = useState<GhostWordGameState | null>(null);
  const [activeConfig, setActiveConfig] = useState<GhostWordConfig>(DEFAULT_CONFIG);
  const [activePreset, setActivePreset] = useState<{ id: string; name: string } | null>(null);
  const [showingReveal, setShowingReveal] = useState(false);
  // Évite de tracker la stat plusieurs fois si le composant re-rend
  const [statTracked, setStatTracked] = useState(false);

  // ── Init de la partie ──────────────────────────────────────────────────────

  useEffect(() => {
    const playersParam = searchParams.get("players");
    const presetIdsParam = searchParams.get("presetIds");
    const ombrePercent = Number(searchParams.get("ombrePercent") ?? 90);
    const discussionTurnsPerRound = Number(searchParams.get("discussionTurns") ?? 2);

    if (!playersParam) {
      router.replace("/games/ghostword");
      return;
    }

    async function initGame() {
      try {
        const playerNames = JSON.parse(playersParam!) as string[];
        let config = DEFAULT_CONFIG;

        if (presetIdsParam) {
          const ids = presetIdsParam.split(",").filter(Boolean);
          if (ids.length > 0) {
            const supabase = createClient();
            const { data: presetsRaw } = await supabase
              .from("presets")
              .select("id, name, config")
              .in("id", ids);

            const presets = (presetsRaw ?? []) as Array<{ id: string; name: string; config: unknown }>;
            const validPresets = presets.filter((p) => {
              const c = p.config as GhostWordConfig;
              return c?.families?.length > 0 && c.families.some((f) => f.words.length >= 2);
            });

            if (validPresets.length > 0) {
              const chosen = validPresets[Math.floor(Math.random() * validPresets.length)];
              config = chosen.config as GhostWordConfig;
              setActivePreset({ id: chosen.id, name: chosen.name });
              // L'incrémentation du play_count est faite à la fin de partie
              // (cf. useEffect de tracking) pour ne compter que les parties
              // réellement terminées.
            }
          }
        }

        setActiveConfig(config);
        const state = createGame({ playerNames, config, ombrePercent, discussionTurnsPerRound });
        setGameState(state);
      } catch {
        router.replace("/games/ghostword");
      }
    }

    initGame();
  }, []);

  // ── Tracking stats quand la partie se termine ──────────────────────────────

  useEffect(() => {
    if (!gameState?.winner || statTracked) return;
    setStatTracked(true);

    async function trackGamePlayed() {
      const supabase = createClient();

      if (activePreset?.id) {
        await supabase.rpc(
          "increment_preset_play_count",
          { p_preset_id: activePreset.id } as never
        );
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("stats")
        .eq("id", user.id)
        .single();

      const stats = (profile as { stats?: Record<string, number> } | null)?.stats;
      const current: Record<string, number> = stats ?? {};
      await supabase
        .from("profiles")
        .update({
          stats: {
            ...current,
            games_played: (current.games_played ?? 0) + 1,
          },
        } as never)
        .eq("id", user.id);
    }

    trackGamePlayed();
  }, [gameState?.winner, statTracked, activePreset]);

  // ── Chargement ─────────────────────────────────────────────────────────────

  if (!gameState) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">👻</div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const alivePlayers = gameState.players.filter((p) => !p.isEliminated);
  const aliveIndex = alivePlayers.findIndex((p) => p.id === currentPlayer?.id) + 1;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleReveal() {
    setShowingReveal(true);
  }

  function handleRevealDone() {
    setShowingReveal(false);
    setGameState((prev) => (prev ? nextPhase(prev) : prev));
  }

  function handleDiscussionNext() {
    setGameState((prev) => (prev ? nextPhase(prev) : prev));
  }

  function handleEliminate(playerId: string) {
    setGameState((prev) => {
      if (!prev) return prev;
      const afterElim = eliminatePlayer(prev, playerId);
      if (afterElim.winner) return afterElim;
      return nextPhase(afterElim);
    });
  }

  function handlePlayAgain() {
    router.push("/games/ghostword");
  }

  function handleGoHome() {
    router.push("/");
  }

  // ── Écran actif ───────────────────────────────────────────────────────────

  function getScreen(): { key: string; node: React.ReactNode } {
    if (gameState.winner) {
      return {
        key: "result",
        node: (
          <ResultScreen
            state={gameState}
            config={activeConfig}
            onPlayAgain={handlePlayAgain}
            onGoHome={handleGoHome}
            presetId={activePreset?.id ?? null}
            presetName={activePreset?.name ?? null}
          />
        ),
      };
    }

    switch (gameState.phase) {
      case "vote":
        return {
          key: "vote",
          node: (
            <VoteScreen
              state={gameState}
              onEliminate={handleEliminate}
            />
          ),
        };

      case "discussion":
        return {
          key: `disc-${gameState.voteRound}-${gameState.discussionTurn}`,
          node: (
            <DiscussionScreen
              state={gameState}
              onNext={handleDiscussionNext}
            />
          ),
        };

      case "veil":
      default:
        if (showingReveal) {
          return {
            key: `reveal-${gameState.currentPlayerIndex}`,
            node: (
              <RevealScreen
                player={currentPlayer}
                onDone={handleRevealDone}
              />
            ),
          };
        }
        return {
          key: `veil-${gameState.currentPlayerIndex}`,
          node: (
            <VeilScreen
              player={currentPlayer}
              playerNumber={aliveIndex}
              totalPlayers={alivePlayers.length}
              onReveal={handleReveal}
            />
          ),
        };
    }
  }

  const { key, node } = getScreen();

  return (
    <AnimatePresence mode="wait">
      <div key={key}>{node}</div>
    </AnimatePresence>
  );
}

export default function GhostWordPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-950 flex items-center justify-center">
          <div className="text-4xl animate-pulse">👻</div>
        </div>
      }
    >
      <GhostWordPlayContent />
    </Suspense>
  );
}
