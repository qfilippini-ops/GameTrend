"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  placeCard,
  getFinalRanking,
} from "@/games/blindrank/engine";
import type { BlindRankGameState, BlindRankCard } from "@/types/games";
import ShareResultButton from "@/components/social/ShareResultButton";

const GAME_KEY = "blindrank:current_game";

// ── Persistance localStorage ────────────────────────────────────

function loadState(): BlindRankGameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GAME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state: BlindRankGameState) {
  localStorage.setItem(GAME_KEY, JSON.stringify(state));
}

/**
 * Incrémente le play_count du preset à la fin d'une partie.
 *
 * Pas d'insert dans `game_results` ici : c'est `ShareResultButton` qui s'en
 * charge (`trackGameResult` au mount = insert minimal pour les stats profil,
 * `shareGameResult` au clic = enrichissement complet si l'utilisateur partage).
 * Pattern identique à DYP — voir `src/app/[locale]/games/dyp/play/page.tsx`.
 */
async function bumpPresetPlayCount(state: BlindRankGameState) {
  if (!state.presetId) return;
  try {
    const supabase = createClient();
    await supabase.rpc("increment_preset_play_count", { p_preset_id: state.presetId });
  } catch {
    // silencieux — un échec de stat ne doit pas casser l'UX
  }
}

// ── Page principale ─────────────────────────────────────────────

export default function BlindRankPlayPage() {
  const t = useTranslations("games.blindrank.play");
  const router = useRouter();
  const [state, setState] = useState<BlindRankGameState | null>(null);
  const [animatingSlot, setAnimatingSlot] = useState<number | null>(null);
  const [resultsSaved, setResultsSaved] = useState(false);
  const saveOnce = useRef(false);
  const slotRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    const loaded = loadState();
    if (!loaded) { router.replace("/games/blindrank"); return; }
    setState(loaded);
  }, [router]);

  useEffect(() => {
    if (state?.phase === "result" && !saveOnce.current) {
      saveOnce.current = true;
      bumpPresetPlayCount(state).then(() => setResultsSaved(true));
    }
  }, [state]);

  function handlePlace(slotIndex: number) {
    if (!state || state.phase !== "place" || !state.currentCard) return;
    if (state.slots[slotIndex] !== null) return;
    if (animatingSlot !== null) return;

    setAnimatingSlot(slotIndex);
    // Délai court pour laisser jouer l'animation visuelle de la carte
    // qui "tombe" dans le slot avant de muter le state.
    setTimeout(() => {
      const newState = placeCard(state, slotIndex);
      saveState(newState);
      setState(newState);
      setAnimatingSlot(null);
      // Auto-scroll vers le prochain slot vide pour faciliter le placement
      // sur de longs racks (≥ 20 slots).
      const nextEmpty = newState.slots.findIndex((s) => s === null);
      if (nextEmpty !== -1) {
        slotRefs.current[nextEmpty]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 220);
  }

  function handleReplay() {
    localStorage.removeItem(GAME_KEY);
    router.push("/games/blindrank");
  }

  if (!state) return null;

  // ── Écran de résultat ─────────────────────────────────────────
  if (state.phase === "result") {
    const ranking = getFinalRanking(state);
    const top3 = ranking.slice(0, 3);
    const rest = ranking.slice(3);
    const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

    return (
      <div
        className="min-h-screen px-4 py-safe"
        style={{
          background:
            "linear-gradient(to bottom, rgba(6,95,123,0.25), #09090b 40%)",
        }}
      >
        <div className="max-w-sm mx-auto py-6 space-y-5">

          {/* Titre */}
          <div className="text-center space-y-3 motion-safe:animate-slide-up">
            <p className="text-cyan-500/60 text-[10px] uppercase tracking-[0.25em] font-mono">
              {t("yourRanking")}
            </p>
            <div className="text-6xl animate-float">🎯</div>
            <h1
              className="text-3xl font-display font-black text-white leading-tight"
              style={{ textShadow: "0 0 30px rgba(6,182,212,0.45)" }}
            >
              {t("resultTitle", { count: state.rackSize })}
            </h1>
          </div>

          {/* Podium top 3 */}
          {top3.length > 0 && (
            <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-800/50">
                <p className="text-white font-display font-bold text-sm">{t("podium")}</p>
              </div>
              <div className="divide-y divide-surface-800/30">
                {top3.map(({ card, position }) => (
                  <div
                    key={card.id}
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
                    <span
                      className={`flex-1 text-sm font-medium ${
                        position === 1 ? "text-cyan-300" : "text-surface-200"
                      }`}
                    >
                      {card.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reste du classement */}
          {rest.length > 0 && (
            <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-800/50">
                <p className="text-surface-400 font-display font-bold text-sm">
                  {t("restRanking")}
                </p>
              </div>
              <div className="divide-y divide-surface-800/20 max-h-72 overflow-y-auto">
                {rest.map(({ card, position }) => (
                  <div key={card.id} className="flex items-center gap-3 px-4 py-2.5">
                    {card.imageUrl ? (
                      <div className="relative w-7 h-7 rounded-lg overflow-hidden shrink-0">
                        <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-surface-800/60 shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-surface-400">{card.name}</span>
                    <span className="text-xs text-surface-600 font-mono">#{position}</span>
                  </div>
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
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                boxShadow: "0 0 18px rgba(6,182,212,0.25)",
              }}
            >
              {t("replay")}
            </button>
            <button
              onClick={() => { localStorage.removeItem(GAME_KEY); router.push("/"); }}
              className="py-4 rounded-2xl border border-surface-700/40 bg-surface-800/50 text-surface-300 font-display font-bold text-sm hover:border-surface-600/60 hover:text-white transition-all"
            >
              {t("home")}
            </button>
          </div>

          {state.presetId && (
            <button
              onClick={() => { localStorage.removeItem(GAME_KEY); router.push(`/presets/${state.presetId}`); }}
              className="w-full py-3 rounded-2xl border border-cyan-700/30 bg-cyan-950/20 text-cyan-400/80 font-semibold text-sm hover:border-cyan-600/50 hover:bg-cyan-950/40 hover:text-cyan-300 transition-all"
            >
              {t("viewPreset")}
            </button>
          )}

          {/* Partage */}
          <ShareResultButton
            result={{
              gameType: "blindrank",
              presetId: state.presetId ?? null,
              presetName: null,
              resultData: {
                rackSize: state.rackSize,
                top3: top3.map((r) => ({ name: r.card.name, position: r.position })),
              },
            }}
            shareText={t("shareText", { name: top3[0]?.card.name ?? "?" })}
            shareUrl={
              state.presetId
                ? `${typeof window !== "undefined" ? window.location.origin : ""}/presets/${state.presetId}`
                : undefined
            }
          />

          {state.presetId && !resultsSaved && (
            <p className="text-surface-700 text-xs text-center">{t("savingStats")}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Phase "place" : carte courante + rack ─────────────────────
  const totalSlots = state.rackSize;
  const placedCount = state.cardsPlaced;
  const progressPct = (placedCount / totalSlots) * 100;
  const remainingTotal = state.remainingCards.length + (state.currentCard ? 1 : 0);

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">

      {/* ── Header sticky ── */}
      <div className="sticky top-0 z-30 bg-surface-950/95 backdrop-blur-md border-b border-surface-800/60 pt-safe">
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { localStorage.removeItem(GAME_KEY); router.push("/games/blindrank"); }}
              className="text-surface-600 hover:text-surface-400 text-sm transition-colors font-medium"
            >
              {t("leave")}
            </button>
            <div className="text-center">
              <p className="text-surface-300 text-xs font-mono font-bold">
                {t("progress", { current: placedCount, total: totalSlots })}
              </p>
              <p className="text-surface-600 text-[10px]">
                {t("remainingCards", { count: remainingTotal })}
              </p>
            </div>
            <div className="w-12" />
          </div>

          {/* Barre de progression */}
          <div className="h-1 bg-surface-800/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-500/70 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Carte courante affichée juste sous le header */}
        {state.currentCard && (
          <div className="px-4 py-3">
            <p className="text-cyan-400/70 text-[10px] uppercase tracking-[0.2em] font-mono mb-2 text-center">
              {t("placeThisCard")}
            </p>
            <div
              key={state.currentCard.id}
              className={`relative mx-auto rounded-2xl overflow-hidden border border-cyan-500/30 motion-safe:animate-card-pop max-w-xs aspect-[5/3] ${
                animatingSlot !== null ? "opacity-30 scale-95 transition-all duration-200" : ""
              }`}
              style={{
                boxShadow: "0 0 24px rgba(6,182,212,0.25), 0 8px 32px rgba(0,0,0,0.5)",
              }}
            >
              {state.currentCard.imageUrl ? (
                <Image
                  src={state.currentCard.imageUrl}
                  alt={state.currentCard.name}
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/80 via-surface-900 to-brand-900/70" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface-950/85 via-surface-950/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 px-4 py-3">
                <p className="font-display font-black text-white text-xl leading-tight drop-shadow-lg line-clamp-2 text-center">
                  {state.currentCard.name}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Rack vertical : un slot par ligne ── */}
      <div className="flex-1 px-4 pt-3 pb-safe pb-6">
        <p className="text-surface-600 text-[10px] uppercase tracking-[0.2em] font-mono text-center mb-3">
          {t("tapToPlace")}
        </p>
        <ol className="space-y-2 max-w-md mx-auto">
          {state.slots.map((slot, idx) => (
            <li key={idx}>
              <RankSlot
                ref={(el) => {
                  slotRefs.current[idx] = el;
                }}
                position={idx + 1}
                card={slot}
                disabled={slot !== null || animatingSlot !== null}
                isLanding={animatingSlot === idx}
                onClick={() => handlePlace(idx)}
              />
            </li>
          ))}
        </ol>
      </div>

    </div>
  );
}

// ── Composant slot ──────────────────────────────────────────────

interface RankSlotProps {
  position: number;
  card: BlindRankCard | null;
  disabled: boolean;
  isLanding: boolean;
  onClick: () => void;
}

const RankSlot = forwardRef<HTMLButtonElement, RankSlotProps>(function RankSlot(
  { position, card, disabled, isLanding, onClick },
  ref
) {
  const isFilled = card !== null;
  const isMedal = position <= 3;
  const medalEmoji = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled && !isFilled}
      aria-label={
        isFilled
          ? `Position ${position} : ${card!.name}`
          : `Placer la carte en position ${position}`
      }
      className={`relative w-full flex items-center gap-3 py-2.5 px-3 rounded-2xl border transition-all text-left ${
        isFilled
          ? "border-surface-700/60 bg-surface-900/80 cursor-default"
          : disabled
          ? "border-dashed border-surface-800/60 bg-surface-900/30 cursor-wait opacity-60"
          : "border-dashed border-cyan-700/40 bg-cyan-950/10 hover:bg-cyan-950/25 hover:border-cyan-500/60 cursor-pointer active:scale-[0.99]"
      } ${isLanding ? "motion-safe:animate-slot-land" : ""}`}
    >
      {/* Numéro / médaille */}
      <span
        className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl font-display font-black text-sm tabular-nums ${
          isMedal
            ? "bg-amber-950/40 text-amber-300 border border-amber-700/30"
            : isFilled
            ? "bg-surface-800/80 text-surface-300 border border-surface-700/40"
            : "bg-cyan-950/30 text-cyan-300/80 border border-cyan-700/30"
        }`}
      >
        {medalEmoji ?? `#${position}`}
      </span>

      {/* Carte placée — image + nom */}
      {isFilled ? (
        <>
          {card!.imageUrl ? (
            <div className="relative shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-surface-700/40">
              <Image src={card!.imageUrl} alt={card!.name} fill className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="shrink-0 w-10 h-10 rounded-lg bg-surface-800/60 border border-surface-700/40 flex items-center justify-center text-surface-700">
              🃏
            </div>
          )}
          <span className="flex-1 text-sm font-semibold text-white truncate">
            {card!.name}
          </span>
        </>
      ) : (
        <>
          <div className="shrink-0 w-10 h-10 rounded-lg border border-dashed border-cyan-700/30 flex items-center justify-center text-cyan-500/40 text-lg">
            +
          </div>
          <span className="flex-1 text-sm font-medium text-surface-500 italic">
            {/* Slot vide */}
          </span>
        </>
      )}
    </button>
  );
});
