"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { vibrate } from "@/lib/utils";
import { startOnlineGame } from "@/app/actions/rooms";
import { createClient } from "@/lib/supabase/client";
import PresetPicker from "@/components/PresetPicker";
import Avatar from "@/components/ui/Avatar";
import type { OnlineRoom, RoomPlayer } from "@/types/rooms";

interface RoomWaitingProps {
  room: OnlineRoom;
  players: RoomPlayer[];
  myName: string;
  isHost: boolean;
  onlineNames?: Set<string>;
  playerAvatars?: Record<string, string | null>;
  onVoluntaryLeave?: () => void;
}

export default function RoomWaiting({ room, players, myName, isHost, onlineNames, playerAvatars, onVoluntaryLeave }: RoomWaitingProps) {
  const t = useTranslations("games.ghostword.online.waiting");
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const cfg = room.config as { abandon_reason?: string; presetIds?: string[]; ombrePercent?: number; auto_start?: boolean };
  const [abandonMsg, setAbandonMsg] = useState(cfg.abandon_reason ?? "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const autoStartFired = useRef(false);

  const config = cfg;
  const [ombrePercent, setOmbrePercent] = useState(config.ombrePercent ?? 90);
  const [discussionTurns, setDiscussionTurns] = useState(room.discussion_turns_per_round);
  const [speakerDuration, setSpeakerDuration] = useState(room.speaker_duration_seconds);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>(config.presetIds ?? []);
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const GHOSTWORD_MIN_PLAYERS = 3;
  // Capacité effective : ghostword se joue jusqu'à room.max_players (4 free
  // / 16 premium, défini par compute_max_players côté SQL). Fallback 16 par
  // sécurité pour les rooms historiques sans la colonne.
  const lobbyCapacity = room.max_players ?? 16;
  const canStart =
    players.length >= GHOSTWORD_MIN_PLAYERS && players.length <= lobbyCapacity;
  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/join/${room.id}` : `/join/${room.id}`;

  useEffect(() => {
    const cfg = room.config as { auto_start?: boolean };
    if (isHost && cfg.auto_start === true && !autoStartFired.current && !starting) {
      autoStartFired.current = true;
      const supabase = createClient();
      supabase.from("game_rooms").update({ config: { ...cfg, auto_start: false } }).eq("id", room.id)
        .then(() => handleStart());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.config]);

  useEffect(() => {
    if (!isHost) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setHostUserId(user.id);
    });
  }, [isHost]);

  async function saveSettings() {
    setSavingSettings(true);
    const supabase = createClient();
    await supabase.from("game_rooms").update({
      config: { presetIds: selectedPresetIds, ombrePercent },
      discussion_turns_per_round: discussionTurns,
      speaker_duration_seconds: speakerDuration,
    }).eq("id", room.id);
    setSavingSettings(false);
    setShowSettings(false);
    vibrate(50);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      vibrate(30);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silencieux */ }
  }

  async function shareInvite() {
    try {
      await navigator.share({ title: t("shareTitle"), text: t("shareText"), url: inviteUrl });
    } catch { copyCode(); }
  }

  async function handleStart() {
    setStarting(true);
    setError("");
    const res = await startOnlineGame(room.id);
    if (res.error) { setError(res.error); setStarting(false); }
  }

  async function handleKick(playerName: string) {
    vibrate(50);
    const supabase = createClient();
    await supabase.rpc("kick_player_fn", { p_room_id: room.id, p_display_name: playerName });
  }

  async function handleCloseLobby() {
    if (!confirm(t("closeLobbyConfirm"))) return;
    vibrate([80, 60, 200]);
    const supabase = createClient();
    await supabase.from("game_rooms").delete().eq("id", room.id);
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex flex-col items-center pt-safe px-5">
      <div className="w-full max-w-sm py-6 space-y-4">

        {/* Banner abandon */}
        <AnimatePresence>
          {abandonMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-700/40 bg-amber-950/25"
            >
              <span className="text-lg shrink-0">⚠️</span>
              <p className="text-amber-300 text-sm font-medium flex-1">{abandonMsg}</p>
              <button onClick={() => setAbandonMsg("")} className="text-amber-700 hover:text-amber-400 text-sm shrink-0 transition-colors">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Code du salon ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-brand-700/20 bg-gradient-to-br from-brand-950/70 via-surface-900 to-surface-950 p-5 text-center"
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 0%, rgba(68,96,255,0.12) 0%, transparent 65%)" }} />
          <p className="text-surface-600 text-[10px] uppercase tracking-[0.25em] mb-3">{t("roomCode")}</p>
          <p
            className="text-5xl font-display font-black text-white tracking-[0.25em] select-all cursor-pointer mb-4"
            style={{ textShadow: "0 0 40px rgba(68,96,255,0.4)" }}
            onClick={copyCode}
          >
            {room.id}
          </p>
          <div className="flex gap-2">
            <button
              onClick={copyCode}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                copied
                  ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-400"
                  : "border-surface-700/40 bg-surface-800/60 text-surface-400 hover:text-white hover:border-surface-600/60"
              }`}
            >
              {copied ? t("copied") : t("copyLink")}
            </button>
            <button
              onClick={shareInvite}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-brand-700/30 bg-brand-950/50 text-brand-300 hover:bg-brand-900/50 transition-all"
            >
              {t("share")}
            </button>
          </div>
        </motion.div>

        {/* ── Joueurs ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
            <p className="text-white font-display font-bold text-sm">{t("players")}</p>
            <span className="text-surface-600 text-xs font-mono">
              {players.length} <span className="text-surface-800">{t("playersCapSuffix", { cap: lobbyCapacity })}</span>
            </span>
          </div>
          <div className="divide-y divide-surface-800/30">
            <AnimatePresence>
              {players.map((p) => {
                const isOnline = !onlineNames || onlineNames.size === 0 || onlineNames.has(p.display_name);
                return (
                  <motion.div
                    key={p.display_name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {/* Avatar */}
                    {p.display_name !== myName && p.user_id ? (
                      <Link href={`/profile/${p.user_id}`} className="relative shrink-0 group">
                        <Avatar
                          src={playerAvatars?.[p.display_name]}
                          name={p.display_name}
                          size="sm"
                          className={`rounded-xl group-hover:ring-2 group-hover:ring-brand-500/50 transition-all ${isOnline ? "" : "opacity-40"}`}
                        />
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-950 ${isOnline ? "bg-emerald-400" : "bg-surface-700"}`} />
                      </Link>
                    ) : (
                      <div className="relative shrink-0">
                        <Avatar
                          src={playerAvatars?.[p.display_name]}
                          name={p.display_name}
                          size="sm"
                          className={`rounded-xl ${isOnline ? "" : "opacity-40"}`}
                        />
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-950 ${isOnline ? "bg-emerald-400" : "bg-surface-700"}`} />
                      </div>
                    )}

                    {/* Nom */}
                    {p.display_name !== myName && p.user_id ? (
                      <Link
                        href={`/profile/${p.user_id}`}
                        className={`text-sm flex-1 hover:text-brand-300 transition-colors ${isOnline ? "text-surface-100" : "text-surface-600"}`}
                      >
                        {p.is_host && <span className="mr-1">👑</span>}
                        {p.display_name}
                        {!isOnline && <span className="text-surface-700 text-xs ml-1">{t("offline")}</span>}
                      </Link>
                    ) : (
                      <span className={`text-sm flex-1 ${isOnline ? "text-surface-100" : "text-surface-600"}`}>
                        {p.is_host && <span className="mr-1">👑</span>}
                        {p.display_name}
                        <span className="text-brand-400/60 text-xs ml-1">{t("you")}</span>
                        {!isOnline && <span className="text-surface-700 text-xs ml-1">{t("offline")}</span>}
                      </span>
                    )}

                    {/* Badge hôte / kick */}
                    {p.is_host ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-brand-950/60 border border-brand-700/25 text-brand-400 font-medium shrink-0">{t("host")}</span>
                    ) : (
                      isHost && (
                        <button
                          onClick={() => handleKick(p.display_name)}
                          title={t("kickTitle", { name: p.display_name })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-surface-700 hover:text-red-400 hover:bg-red-950/40 transition-all text-xs shrink-0"
                        >
                          ✕
                        </button>
                      )
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Paramètres (hôte) ── */}
        {isHost && (
          <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800/30 transition-colors"
            >
              <span className="text-white font-display font-bold text-sm">{t("settings")}</span>
              <span className="text-surface-600 text-xs">{showSettings ? t("close") : t("edit")}</span>
            </button>

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-surface-800/50"
                >
                  <div className="px-4 py-4 space-y-5">
                    <PresetPicker
                      selectedIds={selectedPresetIds}
                      onChange={setSelectedPresetIds}
                      userId={hostUserId}
                      label={t("presets")}
                    />

                    {/* Ombre % */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-surface-400 text-xs font-medium">{t("ombreVsGhost")}</p>
                        <span className="text-white text-xs font-bold font-mono">{ombrePercent}% / {100 - ombrePercent}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={10} value={ombrePercent}
                        onChange={(e) => setOmbrePercent(Number(e.target.value))}
                        className="w-full accent-brand-500" />
                    </div>

                    {/* Tours */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-surface-400 text-xs font-medium">{t("turnsBeforeVote")}</p>
                        <span className="text-white text-xs font-bold font-mono">{discussionTurns}</span>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((n) => (
                          <button key={n} onClick={() => setDiscussionTurns(n)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                              discussionTurns === n ? "bg-brand-600 text-white" : "bg-surface-800 text-surface-500 hover:text-white"
                            }`}
                          >{n}</button>
                        ))}
                      </div>
                    </div>

                    {/* Timer */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-surface-400 text-xs font-medium">{t("timerPerPlayer")}</p>
                        <span className="text-white text-xs font-bold font-mono">{speakerDuration}s</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[15, 20, 30, 45, 60].map((s) => (
                          <button key={s} onClick={() => setSpeakerDuration(s)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                              speakerDuration === s ? "bg-brand-600 text-white" : "bg-surface-800 text-surface-500 hover:text-white"
                            }`}
                          >{s}s</button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={saveSettings}
                      disabled={savingSettings}
                      className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-colors text-sm disabled:opacity-50"
                    >
                      {savingSettings ? t("saving") : t("apply")}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Attente */}
        {!canStart && (
          <p className="text-center text-surface-700 text-sm">
            {t("minPlayersHint", { min: GHOSTWORD_MIN_PLAYERS })}
          </p>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-950/30 border border-red-800/30 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        {/* CTA */}
        {isHost ? (
          <div className="space-y-2">
            <motion.button
              onClick={handleStart}
              disabled={!canStart || starting}
              whileTap={{ scale: canStart ? 0.97 : 1 }}
              className={`w-full py-5 rounded-2xl font-display font-bold text-xl transition-all ${
                canStart
                  ? "bg-gradient-brand text-white glow-brand hover:opacity-92"
                  : "bg-surface-800/60 text-surface-700 cursor-not-allowed border border-surface-700/30"
              }`}
            >
              {starting ? t("starting") : canStart ? t("launch", { count: players.length }) : t("needPlayers")}
            </motion.button>
            <button
              onClick={handleCloseLobby}
              className="w-full py-3 rounded-2xl text-sm font-medium border border-red-800/25 text-red-500/80 hover:bg-red-950/25 hover:border-red-700/40 hover:text-red-400 transition-all"
            >
              {t("closeLobby")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 py-4 rounded-2xl border border-surface-800/40 bg-surface-900/30 text-surface-600 text-sm">
              <div className="w-3 h-3 rounded-full border-2 border-surface-700 border-t-transparent animate-spin" />
              {t("waitingHostStart")}
            </div>
            <button
              onClick={async () => {
                onVoluntaryLeave?.();
                const supabase = createClient();
                await supabase.rpc("quit_room_fn", { p_room_id: room.id, p_display_name: myName });
                router.push("/");
              }}
              className="w-full py-3 rounded-2xl text-sm font-medium border border-surface-700/25 text-surface-600 hover:text-red-400 hover:border-red-800/30 transition-all"
            >
              {t("leaveRoom")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
