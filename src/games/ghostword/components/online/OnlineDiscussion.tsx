"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/ui/Avatar";
import type { OnlineRoom, RoomPlayer, RoomMessage } from "@/types/rooms";

interface OnlineDiscussionProps {
  room: OnlineRoom;
  players: RoomPlayer[];
  messages: RoomMessage[];
  myName: string;
  playerAvatars?: Record<string, string | null>;
}

export default function OnlineDiscussion({ room, players, messages, myName, playerAvatars }: OnlineDiscussionProps) {
  const t = useTranslations("games.ghostword.online.discussion");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [timeLeft, setTimeLeft] = useState(() => {
    if (!room.speaker_started_at) return room.speaker_duration_seconds;
    const elapsed = (Date.now() - new Date(room.speaker_started_at).getTime()) / 1000;
    return Math.max(0, Math.ceil(room.speaker_duration_seconds - elapsed));
  });
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  const sendingRef = useRef(sending);
  const hasAutoSubmitted = useRef(false);

  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

  const alive = players.filter((p) => !p.is_eliminated).sort((a, b) => a.join_order - b.join_order);
  const currentSpeaker = alive[room.current_speaker_index];
  const isMyTurn = currentSpeaker?.display_name === myName;
  const currentMessages = messages.filter((m) => m.vote_round === room.vote_round);

  useEffect(() => {
    hasAutoSubmitted.current = false;
  }, [room.current_speaker_index, room.discussion_turn]);

  useEffect(() => {
    if (!room.speaker_started_at || !isMyTurn) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - new Date(room.speaker_started_at!).getTime()) / 1000;
      const remaining = Math.max(0, room.speaker_duration_seconds - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && !sendingRef.current && !hasAutoSubmitted.current) {
        hasAutoSubmitted.current = true;
        clearInterval(interval);
        handleSend(inputRef.current);
      }
    }, 300);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.speaker_started_at, room.current_speaker_index, isMyTurn]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages.length]);

  async function handleSend(msg?: string) {
    if (sendingRef.current) return;
    const text = (msg !== undefined ? msg : inputRef.current).trim();
    setSending(true);
    sendingRef.current = true;
    vibrate(50);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("room_messages").insert({
        room_id: room.id,
        player_name: myName,
        message: text || "(passe)",
        discussion_turn: room.discussion_turn,
        vote_round: room.vote_round,
      });
    }
    setInput("");
    setSending(false);
    sendingRef.current = false;
  }

  const timerPercent = (timeLeft / room.speaker_duration_seconds) * 100;
  const timerColor =
    timeLeft > room.speaker_duration_seconds * 0.5
      ? "#4460ff"
      : timeLeft > room.speaker_duration_seconds * 0.25
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col pt-safe relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl pointer-events-none"
        style={{ background: isMyTurn ? "rgba(68,96,255,0.07)" : "rgba(46,51,96,0.03)" }}
      />

      {/* Banner prolongation */}
      {room.tie_count > 0 && (
        <div className="relative z-10 px-4 py-2.5 border-b border-amber-700/30 bg-amber-950/25 text-center">
          <p className="text-amber-300 text-xs font-display font-bold tracking-wide">
            {t("extension", { count: room.tie_count })}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 px-4 py-3 border-b border-surface-800/50">
        {/* Ligne info */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-surface-700 text-[10px] uppercase tracking-widest font-mono">
            {t("turnInfo", { turn: room.discussion_turn, total: room.discussion_turns_per_round, round: room.vote_round + 1 })}
          </p>
          {room.speaker_started_at && isMyTurn && (
            <span className="text-sm font-display font-black tabular-nums" style={{ color: timerColor }}>
              {timeLeft}s
            </span>
          )}
        </div>

        {/* Progress tours */}
        <div className="flex gap-1.5 mb-2.5">
          {Array.from({ length: room.discussion_turns_per_round }).map((_, i) => (
            <div
              key={i}
              className="h-0.5 flex-1 rounded-full transition-all"
              style={{
                background: i < room.discussion_turn
                  ? "linear-gradient(90deg, #4460ff, #d946ef)"
                  : "rgba(46,51,96,0.35)",
              }}
            />
          ))}
        </div>

        {/* Timer bar */}
        {room.speaker_started_at && isMyTurn && (
          <div className="h-1 bg-surface-800/60 rounded-full overflow-hidden mb-2.5">
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${timerPercent}%` }}
              transition={{ duration: 0.3 }}
              style={{ background: timerColor, boxShadow: `0 0 8px ${timerColor}60` }}
            />
          </div>
        )}

        {/* Speaker */}
        <div className="flex items-center gap-2">
          <span className="text-surface-600 text-xs">{t("turnOf")}</span>
          {currentSpeaker && (
            <Avatar
              src={playerAvatars?.[currentSpeaker.display_name]}
              name={currentSpeaker.display_name}
              size="sm"
              className="rounded-lg"
            />
          )}
          <span className={`text-sm font-display font-bold ${isMyTurn ? "text-brand-300" : "text-white"}`}>
            {currentSpeaker?.is_host && <span className="mr-1">👑</span>}
            {isMyTurn ? t("you") : (currentSpeaker?.display_name ?? "…")}
          </span>
          {isMyTurn && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/25 font-bold animate-pulse">
              {t("yourTurn")}
            </span>
          )}
        </div>
      </div>

      {/* Chat */}
      <div ref={chatRef} className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <AnimatePresence>
          {currentMessages.length === 0 && (
            <div className="text-center py-10 text-surface-700 text-sm">{t("discussionStarting")}</div>
          )}
          {currentMessages.map((msg) => {
            const isMe = msg.player_name === myName;
            const isPasse = msg.message === "(passe)";
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}
              >
                <Avatar
                  src={playerAvatars?.[msg.player_name]}
                  name={msg.player_name}
                  size="sm"
                  className="rounded-lg shrink-0 self-end"
                />
                <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  <span className="text-surface-600 text-[10px] px-1 font-medium">
                    {players.find((p) => p.display_name === msg.player_name)?.is_host ? "👑 " : ""}
                    {msg.player_name}
                  </span>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isPasse
                      ? "text-surface-600 italic bg-surface-900/40 border border-surface-800/40"
                      : isMe
                      ? "bg-brand-600/20 text-white border border-brand-500/25 rounded-tr-sm"
                      : "bg-surface-800/70 text-surface-100 border border-surface-700/30 rounded-tl-sm"
                  }`}>
                    {isPasse ? t("passedHerSuffix") : msg.message}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Ordre des joueurs */}
      <div className="relative z-10 px-4 py-2 flex gap-1.5 overflow-x-auto border-t border-surface-800/40 scrollbar-hide">
        {alive.map((p, i) => {
          const isCurrent = i === room.current_speaker_index;
          const hasSpoken = i < room.current_speaker_index;
          return (
            <div
              key={p.display_name}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all ${
                isCurrent
                  ? "bg-brand-600/20 border border-brand-500/30"
                  : hasSpoken
                  ? "bg-surface-900/30 opacity-40"
                  : "bg-surface-900/50 border border-surface-800/30"
              }`}
            >
              <Avatar
                src={playerAvatars?.[p.display_name]}
                name={p.display_name}
                size="sm"
                className="rounded-md !w-5 !h-5 text-[9px]"
              />
              <span className={`text-xs font-medium whitespace-nowrap ${
                isCurrent ? "text-brand-300" : hasSpoken ? "text-surface-600 line-through" : "text-surface-500"
              }`}>
                {p.is_host ? "👑 " : ""}{p.display_name === myName ? t("youSuffix", { name: p.display_name }) : p.display_name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="relative z-10 px-4 pb-safe pb-4 pt-3 border-t border-surface-800/40">
        {isMyTurn ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
              placeholder={t("yourCluePlaceholder")}
              maxLength={80}
              autoFocus
              className="flex-1 bg-surface-800/50 border border-brand-500/35 focus:border-brand-400/60 text-white placeholder-surface-700 rounded-xl px-4 py-3 text-sm outline-none transition-all"
            />
            <button
              onClick={() => handleSend()}
              disabled={sending}
              className="px-4 py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm shrink-0"
            >
              {sending ? "…" : "→"}
            </button>
            <button
              onClick={() => handleSend("")}
              disabled={sending}
              className="px-3 py-3 bg-surface-800/60 hover:bg-surface-700/60 text-surface-500 hover:text-white rounded-xl transition-colors text-xs shrink-0 border border-surface-700/30"
            >
              {t("pass")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2.5 text-surface-600 text-sm">
            <div className="w-3 h-3 rounded-full border-2 border-surface-700 border-t-transparent animate-spin" />
            {t("waitingFor", { name: currentSpeaker?.display_name ?? "…" })}
          </div>
        )}
      </div>
    </div>
  );
}
