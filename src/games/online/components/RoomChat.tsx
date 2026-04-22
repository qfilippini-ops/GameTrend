"use client";

/**
 * Composant chat partagé pour les jeux online.
 *
 * Modes :
 *   - "realtime"   : tout le monde peut écrire à tout moment (Blind Rank)
 *   - "turn-based" : seul le joueur dont c'est le tour peut écrire (GhostWord)
 *
 * Les messages sont insérés directement dans `room_messages` (RLS garantit
 * que seuls les joueurs de la room peuvent écrire). Realtime via channel
 * Supabase, déjà géré au niveau du parent (useRoomChannel).
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { vibrate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/ui/Avatar";
import type { RoomMessage } from "@/types/rooms";

export interface RoomChatLabels {
  emptyState: string;
  inputPlaceholder: string;
  sendShort: string;
  passShort: string;
  passedLabel: string;
  waitingForOther: (name: string) => string;
}

interface RoomChatProps {
  roomId: string;
  myName: string;
  messages: RoomMessage[];
  /**
   * Map display_name → avatar_url (depuis useRoomChannel.playerAvatars).
   */
  playerAvatars?: Record<string, string | null>;
  labels: RoomChatLabels;

  /** Mode du chat */
  mode: "realtime" | "turn-based";

  /**
   * Mode "turn-based" uniquement :
   * Tour courant + nom du speaker. Quand mode = "realtime", ces props sont
   * ignorées.
   */
  currentSpeaker?: string;
  /** Si true en turn-based, c'est mon tour de parler */
  isMyTurn?: boolean;
  /** Filtre des messages affichés (ex: par vote_round) */
  filter?: (msg: RoomMessage) => boolean;
  /**
   * Métadonnées à insérer avec chaque message (turn-based).
   * Pour blind rank en realtime on peut passer { discussion_turn: 0, vote_round: 0 } ou
   * lier au tour courant pour rendre le filtrage facile.
   */
  messageMeta?: { discussion_turn: number; vote_round: number };
  /**
   * Si true, en mode turn-based, l'auto-pass à 0s du timer est délégué au parent
   * via `onTimerEnd`. Le parent doit appeler chat.handleSend("") quand il faut.
   */
  enableSendButton?: boolean;
  /** Hauteur min de la zone de chat (défaut: flex-1) */
  className?: string;
}

export default function RoomChat({
  roomId,
  myName,
  messages,
  playerAvatars,
  labels,
  mode,
  currentSpeaker,
  isMyTurn = mode === "realtime",
  filter,
  messageMeta = { discussion_turn: 0, vote_round: 0 },
  enableSendButton = true,
  className,
}: RoomChatProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(sending);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  const visibleMessages = filter ? messages.filter(filter) : messages;

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [visibleMessages.length]);

  async function handleSend(msgOverride?: string) {
    if (sendingRef.current) return;
    const text = (msgOverride !== undefined ? msgOverride : input).trim();
    // En realtime : pas d'envoi si vide. En turn-based : permet "(passe)".
    if (mode === "realtime" && !text) return;
    setSending(true);
    sendingRef.current = true;
    vibrate(50);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("room_messages").insert({
        room_id: roomId,
        player_name: myName,
        message: text || "(passe)",
        discussion_turn: messageMeta.discussion_turn,
        vote_round: messageMeta.vote_round,
      });
    }
    setInput("");
    setSending(false);
    sendingRef.current = false;
  }

  const canSend = mode === "realtime" ? true : isMyTurn;

  return (
    <div className={`flex flex-col ${className ?? "flex-1 min-h-0"}`}>
      {/* Liste des messages */}
      <div
        ref={chatRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5"
      >
        <AnimatePresence>
          {visibleMessages.length === 0 && (
            <div className="text-center py-6 text-surface-700 text-xs">{labels.emptyState}</div>
          )}
          {visibleMessages.map((msg) => {
            const isMe = msg.player_name === myName;
            const isPasse = msg.message === "(passe)";
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
              >
                <Avatar
                  src={playerAvatars?.[msg.player_name]}
                  name={msg.player_name}
                  size="sm"
                  className="rounded-lg shrink-0 self-end !w-7 !h-7 text-[10px]"
                />
                <div
                  className={`max-w-[72%] flex flex-col gap-0.5 ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  <span className="text-surface-600 text-[10px] px-1 font-medium">
                    {msg.player_name}
                  </span>
                  <div
                    className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      isPasse
                        ? "text-surface-600 italic bg-surface-900/40 border border-surface-800/40"
                        : isMe
                        ? "bg-brand-600/20 text-white border border-brand-500/25 rounded-tr-sm"
                        : "bg-surface-800/70 text-surface-100 border border-surface-700/30 rounded-tl-sm"
                    }`}
                  >
                    {isPasse ? labels.passedLabel : msg.message}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Zone de saisie */}
      <div className="px-3 py-2 border-t border-surface-800/40 shrink-0">
        {canSend ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
              placeholder={labels.inputPlaceholder}
              maxLength={120}
              className="flex-1 bg-surface-800/50 border border-surface-700/30 focus:border-brand-500/50 text-white placeholder-surface-700 rounded-xl px-3 py-2 text-xs outline-none transition-all"
            />
            {enableSendButton && (
              <button
                onClick={() => handleSend()}
                disabled={sending || (mode === "realtime" && !input.trim())}
                className="px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-xs shrink-0"
              >
                {sending ? "…" : labels.sendShort}
              </button>
            )}
            {mode === "turn-based" && (
              <button
                onClick={() => handleSend("")}
                disabled={sending}
                className="px-3 py-2 bg-surface-800/60 hover:bg-surface-700/60 text-surface-500 hover:text-white rounded-xl transition-colors text-[10px] shrink-0 border border-surface-700/30"
              >
                {labels.passShort}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1.5 text-surface-600 text-xs">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-surface-700 border-t-transparent animate-spin" />
            {labels.waitingForOther(currentSpeaker ?? "…")}
          </div>
        )}
      </div>
    </div>
  );
}
