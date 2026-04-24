"use client";

/**
 * Phase "result" de Outbid online (1v1).
 *
 * Affiche les 2 équipes côte à côte avec couleurs distinctives :
 *   - Joueur A : ambre/jaune
 *   - Joueur B : bleu (sky)
 * Pas de gagnant déclaré : les joueurs jugent eux-mêmes.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import ShareResultButton from "@/components/social/ShareResultButton";
import { OUTBID_STARTING_POINTS } from "@/games/outbid/online-config";
import type { OnlineRoom, ReplayVote, RoomPlayer } from "@/types/rooms";
import type { DYPCard } from "@/types/games";

// Thème par joueur (positions A/B). Cohérent avec la phase "playing".
type PlayerSlot = "A" | "B";
const RESULT_THEMES: Record<
  PlayerSlot,
  {
    bg: string;
    border: string;
    ring: string;
    text: string;
    textBright: string;
    accent: string;
    accentSoft: string;
    cardBorder: string;
    glow: string;
    chip: string;
  }
> = {
  A: {
    bg: "bg-gradient-to-b from-amber-950/40 via-surface-900/70 to-surface-950",
    border: "border-amber-600/50",
    ring: "ring-amber-500/60",
    text: "text-amber-300",
    textBright: "text-amber-200",
    accent: "text-amber-400",
    accentSoft: "text-amber-500/80",
    cardBorder: "ring-amber-700/40",
    glow: "0 0 32px rgba(245,158,11,0.25)",
    chip: "bg-amber-950/60 text-amber-300 border border-amber-700/40",
  },
  B: {
    bg: "bg-gradient-to-b from-sky-950/40 via-surface-900/70 to-surface-950",
    border: "border-sky-600/50",
    ring: "ring-sky-500/60",
    text: "text-sky-300",
    textBright: "text-sky-200",
    accent: "text-sky-400",
    accentSoft: "text-sky-500/80",
    cardBorder: "ring-sky-700/40",
    glow: "0 0 32px rgba(56,189,248,0.25)",
    chip: "bg-sky-950/60 text-sky-300 border border-sky-700/40",
  },
};

interface OutbidPlayerFinal {
  name: string;
  points: number;
  team: Array<{ cardId: string; price: number }>;
}

interface NaviVerdict {
  verdict: string;
  locale: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

interface OutbidFinalState {
  presetId: string | null;
  teamSize: number;
  cards: DYPCard[];
  playerA: OutbidPlayerFinal;
  playerB: OutbidPlayerFinal;
  finished: boolean;
  autoFill: boolean;
  navi?: NaviVerdict | null;
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

function fmt(n: number): string {
  return n.toLocaleString("fr-FR");
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
  const tNavi = useTranslations("games.outbid.online.navi");
  const locale = useLocale();
  const { isPremium } = useSubscription();
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
    naviVerdict: state.navi
      ? {
          verdict: state.navi.verdict,
          authorName: state.navi.authorName,
          locale: state.navi.locale,
        }
      : null,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 via-surface-900 to-surface-950 flex flex-col items-center pt-safe px-3 pb-8">
      <div className="w-full max-w-3xl py-6 space-y-5">
        {/* Header */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="text-center"
        >
          <div className="text-5xl mb-3">🪙</div>
          <p className="text-surface-600 text-[10px] uppercase tracking-[0.25em] mb-1.5">
            {t("gameOver")}
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-white mb-1">
            {t("title")}
          </h1>
          <p className="text-surface-500 text-xs">{t("subtitle")}</p>
        </motion.div>

        {/* VS bandeau */}
        <div className="flex items-center justify-center gap-3 text-center">
          <PlayerHero
            slot="A"
            player={state.playerA}
            avatar={playerAvatars?.[state.playerA.name] ?? null}
            isYou={state.playerA.name === myName}
            t={t}
          />
          <div className="text-surface-600 font-display font-black text-2xl shrink-0">
            VS
          </div>
          <PlayerHero
            slot="B"
            player={state.playerB}
            avatar={playerAvatars?.[state.playerB.name] ?? null}
            isYou={state.playerB.name === myName}
            t={t}
          />
        </div>

        {/* Deux équipes côte à côte */}
        <div className="grid grid-cols-2 gap-3">
          <TeamColumn
            slot="A"
            player={state.playerA}
            cardById={cardById}
            t={t}
          />
          <TeamColumn
            slot="B"
            player={state.playerB}
            cardById={cardById}
            t={t}
          />
        </div>

        {/* Navi — Arbitre IA (premium) */}
        <NaviPanel
          roomId={room.id}
          navi={state.navi ?? null}
          isPremium={isPremium}
          locale={locale}
          t={tNavi}
        />

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

// ── Sous-composant : avatar + nom + points (en-tête VS) ────────────────────
function PlayerHero({
  slot,
  player,
  avatar,
  isYou,
  t,
}: {
  slot: PlayerSlot;
  player: OutbidPlayerFinal;
  avatar: string | null;
  isYou: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const theme = RESULT_THEMES[slot];
  const spent = OUTBID_STARTING_POINTS - player.points;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: slot === "A" ? 0.1 : 0.2 }}
      className="flex-1 min-w-0 flex flex-col items-center"
    >
      <div
        className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden ring-4 ${theme.ring}`}
        style={{ boxShadow: theme.glow }}
      >
        {avatar ? (
          <Image
            src={avatar}
            alt={player.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-600 to-ghost-600 flex items-center justify-center text-white text-2xl font-bold">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <p className={`mt-2 text-sm font-display font-bold truncate max-w-full ${theme.textBright}`}>
        {player.name}
        {isYou && <span className="ml-1 text-[10px] text-surface-500">({t("you")})</span>}
      </p>
      <div className="mt-0.5 flex flex-col items-center gap-0.5 leading-tight">
        <span className={`text-[10px] font-mono font-bold ${theme.accent}`}>
          {fmt(player.points)} pts
        </span>
        <span className="text-[9px] font-mono text-surface-600">
          −{fmt(spent)}
        </span>
      </div>
    </motion.div>
  );
}

// ── Sous-composant : colonne équipe ──────────────────────────────────────
function TeamColumn({
  slot,
  player,
  cardById,
  t,
}: {
  slot: PlayerSlot;
  player: OutbidPlayerFinal;
  cardById: Map<string, DYPCard>;
  t: ReturnType<typeof useTranslations>;
}) {
  const theme = RESULT_THEMES[slot];
  const totalSpent = player.team.reduce((sum, c) => sum + c.price, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: slot === "A" ? 0.2 : 0.3 }}
      className={`rounded-2xl border-2 ${theme.border} ${theme.bg} overflow-hidden flex flex-col`}
      style={{ boxShadow: theme.glow }}
    >
      {/* Header compact */}
      <div className={`px-3 py-1.5 border-b ${theme.border} flex items-center justify-between gap-2`}>
        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${theme.text}`}>
          {t(slot === "A" ? "playerASide" : "playerBSide")}
        </span>
        <span className={`text-[10px] font-mono font-bold ${theme.accent}`}>
          {t("cardsCount", { n: player.team.length })}
        </span>
      </div>

      {/* Cartes en grille carrée 2 colonnes */}
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {player.team.length === 0 ? (
          <p className="col-span-2 text-surface-700 text-xs text-center py-4 italic">
            {t("emptyTeam")}
          </p>
        ) : (
          player.team.map((entry, i) => {
            const card = cardById.get(entry.cardId);
            if (!card) return null;
            return (
              <motion.div
                key={`${entry.cardId}-${i}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.04 }}
                className={`relative rounded-lg overflow-hidden ring-1 ${theme.cardBorder} aspect-square`}
                title={`${card.name} — ${fmt(entry.price)} pts`}
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
                  <div className="w-full h-full bg-gradient-to-br from-surface-800 to-surface-900" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-1 pt-3 pb-1">
                  <p className="text-white text-[9px] font-bold leading-tight line-clamp-1">
                    {card.name}
                  </p>
                  <p className={`${theme.text} text-[10px] font-mono font-bold leading-tight`}>
                    {entry.price === 0 ? t("freePrice") : fmt(entry.price)}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Footer total dépensé */}
      <div
        className={`px-3 py-1.5 border-t ${theme.border} bg-black/30 text-[10px] font-mono flex justify-between items-center`}
      >
        <span className="text-surface-500 uppercase tracking-wider">
          {t("totalLabel")}
        </span>
        <span className={`font-bold ${theme.textBright}`}>
          {t("totalSpent", { amount: fmt(totalSpent) })}
        </span>
      </div>
    </motion.div>
  );
}

// ── Sous-composant : Navi (arbitre IA premium) ────────────────────────────
// - Si le verdict existe déjà : accordéon plié de base
// - Sinon : bouton "Départager avec Navi"
//   - non-premium → modal upsell vers /pricing
//   - premium → POST /api/games/outbid/navi (idempotent)
//   Le verdict apparaît automatiquement via Realtime sur game_rooms.config.
function NaviPanel({
  roomId,
  navi,
  isPremium,
  locale,
  t,
}: {
  roomId: string;
  navi: NaviVerdict | null;
  isPremium: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);

  async function requestVerdict() {
    if (loading) return;
    if (!isPremium) {
      vibrate(40);
      setShowUpsell(true);
      return;
    }
    setError(null);
    setLoading(true);
    vibrate(30);
    try {
      const res = await fetch("/api/games/outbid/navi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, locale }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "unknown_error");
      }
      // En cas de succès le verdict arrive via Realtime sur game_rooms
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }

  // Cas 1 : verdict déjà disponible → accordéon
  if (navi) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-violet-700/40 bg-gradient-to-br from-violet-950/40 via-surface-900/60 to-surface-950 overflow-hidden"
        style={{ boxShadow: "0 0 28px rgba(139,92,246,0.18)" }}
      >
        <button
          type="button"
          onClick={() => {
            vibrate(20);
            setExpanded((v) => !v);
          }}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-violet-900/20 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">🤖</span>
            <div className="min-w-0">
              <p className="text-violet-200 text-sm font-display font-bold truncate">
                {t("verdictTitle")}
              </p>
              <p className="text-violet-400/70 text-[10px] truncate">
                {t("requestedBy", { name: navi.authorName })}
              </p>
            </div>
          </div>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-violet-300 text-lg shrink-0"
            aria-hidden
          >
            ▾
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 border-t border-violet-800/40">
                <p className="text-violet-100 text-sm whitespace-pre-line leading-relaxed">
                  {navi.verdict}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Cas 2 : pas encore de verdict → bouton + éventuelle modal upsell
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-violet-700/40 bg-violet-950/20 p-3"
      >
        <button
          type="button"
          onClick={requestVerdict}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl font-display font-bold text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-92 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ boxShadow: "0 0 22px rgba(139,92,246,0.35)" }}
        >
          {loading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span>{t("loading")}</span>
            </>
          ) : (
            <>
              <span className="text-base">🤖</span>
              <span>{t("button")}</span>
              {!isPremium && <span className="text-[10px] opacity-90">🔒</span>}
            </>
          )}
        </button>
        {!isPremium && (
          <p className="text-violet-300/80 text-[10px] text-center mt-2">
            {t("premiumHint")}
          </p>
        )}
        {error && (
          <p className="text-rose-400 text-[10px] text-center mt-2 font-mono">
            {t("error", { msg: error })}
          </p>
        )}
      </motion.div>

      <AnimatePresence>
        {showUpsell && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowUpsell(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-violet-700/50 bg-gradient-to-b from-violet-950/90 to-surface-950 p-6 space-y-4"
              style={{ boxShadow: "0 0 60px rgba(139,92,246,0.4)" }}
            >
              <div className="text-center space-y-2">
                <div className="text-4xl">🤖</div>
                <h3 className="text-white font-display font-black text-lg">
                  {t("upsellTitle")}
                </h3>
                <p className="text-surface-300 text-sm">{t("upsellBody")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowUpsell(false)}
                  className="py-2.5 rounded-xl text-sm font-bold border border-surface-700 bg-surface-900 text-surface-300 hover:bg-surface-800 transition-colors"
                >
                  {t("upsellCancel")}
                </button>
                <Link
                  href={`/${locale}/premium`}
                  className="py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-center hover:opacity-92 transition-opacity"
                >
                  {t("upsellCta")}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
