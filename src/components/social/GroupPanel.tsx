"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import GroupCapacityInfo from "@/components/premium/GroupCapacityInfo";
import { useAuth } from "@/hooks/useAuth";
import { useGroup } from "@/hooks/useGroup";
import {
  sendGroupMessage,
  leaveGroup,
  kickGroupMember,
} from "@/app/actions/groups";
import type { GroupMessage } from "@/types/groups";

const ONLINE_GAMES = new Set(["ghostword", "blindrank", "dyp", "outbid"]);

export default function GroupPanel() {
  const t = useTranslations("groups");
  const tNotif = useTranslations("notifications");
  const { user } = useAuth();
  const isConnected = !!(user && !user.is_anonymous);
  const {
    group,
    members,
    messages,
    pendingInvites,
    loading,
    isHost,
    capacity,
  } = useGroup();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"chat" | "members">("chat");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Bloque le scroll body quand le modal est ouvert
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Échap pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-scroll vers le dernier message
  useEffect(() => {
    if (open && tab === "chat" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, open, tab]);

  const memberCount = members.length;
  const hasGroup = !!group;
  const hasPendingInvites = pendingInvites.length > 0;

  const myUserId = user?.id ?? null;
  const memberById = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const m of members) map.set(m.user_id, m);
    return map;
  }, [members]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setDraft("");
    const result = await sendGroupMessage(trimmed);
    if ("error" in result) {
      setDraft(trimmed);
    }
    setSending(false);
  }

  async function handleLeave() {
    if (!confirm(t("leaveConfirm"))) return;
    await leaveGroup();
    setOpen(false);
  }

  async function handleKick(targetId: string) {
    if (!confirm(t("kickConfirm"))) return;
    await kickGroupMember(targetId);
  }

  function renderMessage(msg: GroupMessage) {
    if (msg.type === "system") {
      const username = (msg.payload as { username?: string })?.username || "?";
      const verb = msg.content;
      const label =
        verb === "joined"
          ? t("sysJoined", { name: username })
          : verb === "left"
            ? t("sysLeft", { name: username })
            : verb === "kicked"
              ? t("sysKicked", { name: username })
              : verb;
      return (
        <div
          key={msg.id}
          className="text-center text-[11px] text-surface-500 italic py-1"
        >
          {label}
        </div>
      );
    }

    if (msg.type === "lobby_share") {
      const payload = msg.payload as {
        code: string;
        game_type: string;
        host_name: string;
      };
      const canJoin = ONLINE_GAMES.has(payload.game_type);
      const href = canJoin
        ? `/games/${payload.game_type}/online/${payload.code}`
        : null;
      return (
        <div
          key={msg.id}
          className="my-2 mx-2 rounded-xl border border-brand-600/40 bg-brand-600/10 p-3"
        >
          <p className="text-[12px] text-white leading-snug">
            <span className="mr-1">🎮</span>
            <span className="font-medium">{payload.host_name}</span>{" "}
            {t("lobbyShareLabel", { game: payload.game_type })}
          </p>
          {href && (
            <Link
              href={href}
              onClick={() => setOpen(false)}
              className="mt-2 inline-block w-full rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[12px] font-bold text-center px-3 py-1.5 transition-colors"
            >
              {t("joinLobby")}
            </Link>
          )}
        </div>
      );
    }

    // text
    const author = msg.user_id ? memberById.get(msg.user_id) : null;
    const isMine = !!myUserId && msg.user_id === myUserId;
    return (
      <div
        key={msg.id}
        className={`flex items-start gap-2 px-3 py-1.5 ${
          isMine ? "flex-row-reverse" : ""
        }`}
      >
        {!isMine && (
          <Avatar
            src={author?.avatar_url}
            name={author?.username}
            size="xs"
            className="rounded-lg shrink-0"
          />
        )}
        <div
          className={`max-w-[78%] px-2.5 py-1.5 rounded-2xl text-[13px] leading-snug break-words ${
            isMine
              ? "bg-brand-600 text-white rounded-br-sm"
              : "bg-surface-800/80 text-surface-100 rounded-bl-sm"
          }`}
        >
          {!isMine && (
            <p className="text-[10px] font-medium text-brand-300 mb-0.5">
              {author?.username ?? "?"}
            </p>
          )}
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-white hover:border-brand-500/50 transition-all"
        aria-label={t("ariaLabel")}
      >
        💬
        {isConnected && hasGroup && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-brand-500 border border-surface-900 text-white text-[9px] font-bold flex items-center justify-center">
            {memberCount}
          </span>
        )}
        {isConnected && hasPendingInvites && !hasGroup && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-surface-900 animate-pulse" />
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="group-modal"
                className="fixed inset-0 z-[300] flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setOpen(false)}
                />

                {/* Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 10 }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  className="relative w-full max-w-md h-[80vh] rounded-2xl border border-surface-700/40 bg-surface-900 shadow-2xl flex flex-col overflow-hidden"
                >
                  {!isConnected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
                      <span className="text-4xl">💬</span>
                      <p className="text-white font-display font-bold text-base">
                        {t("title")}
                      </p>
                      <p className="text-surface-400 text-sm leading-relaxed max-w-xs">
                        {t("authPrompt")}
                      </p>
                      <Link
                        href="/auth/login"
                        onClick={() => setOpen(false)}
                        className="mt-2 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors"
                      >
                        {tNotif("loginCta")}
                      </Link>
                    </div>
                  ) : loading ? (
                    <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">
                      {t("loading")}
                    </div>
                  ) : !hasGroup ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
                      <span className="text-4xl">💬</span>
                      <p className="text-white font-display font-bold text-base">
                        {t("title")}
                      </p>
                      <p className="text-surface-400 text-sm leading-relaxed max-w-xs">
                        {t("empty")}
                      </p>
                      <p className="text-surface-500 text-xs max-w-xs">
                        {t("emptyHint")}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800/60 shrink-0">
                        <div className="flex items-center min-w-0">
                          <p className="text-white font-display font-bold text-sm truncate">
                            {t("title")}
                          </p>
                          <span className="ml-2 text-xs text-surface-400 shrink-0">
                            {memberCount}/{capacity}
                          </span>
                          <GroupCapacityInfo capacity={capacity} />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleLeave}
                            className="text-[11px] text-surface-400 hover:text-red-400 transition-colors"
                          >
                            {t("leave")}
                          </button>
                          <button
                            onClick={() => setOpen(false)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-surface-400 hover:text-white hover:bg-surface-800/60 transition-colors"
                            aria-label={t("close")}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex border-b border-surface-800/40 shrink-0">
                        <button
                          onClick={() => setTab("chat")}
                          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                            tab === "chat"
                              ? "text-white border-b-2 border-brand-500"
                              : "text-surface-500 hover:text-surface-300"
                          }`}
                        >
                          {t("tabChat")}
                        </button>
                        <button
                          onClick={() => setTab("members")}
                          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                            tab === "members"
                              ? "text-white border-b-2 border-brand-500"
                              : "text-surface-500 hover:text-surface-300"
                          }`}
                        >
                          {t("tabMembers")}
                        </button>
                      </div>

                      {tab === "chat" ? (
                        <div className="flex-1 flex flex-col min-h-0">
                          <div
                            ref={messagesScrollRef}
                            className="flex-1 overflow-y-auto py-2"
                          >
                            {messages.length === 0 ? (
                              <p className="text-surface-600 text-xs text-center py-12">
                                {t("noMessages")}
                              </p>
                            ) : (
                              <>
                                {messages.map(renderMessage)}
                                <div ref={messagesEndRef} />
                              </>
                            )}
                          </div>
                          <form
                            onSubmit={handleSend}
                            className="border-t border-surface-800/40 p-2 flex gap-2 shrink-0"
                          >
                            <input
                              type="text"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder={t("placeholder")}
                              maxLength={1000}
                              className="flex-1 px-3 py-2 rounded-xl bg-surface-800/80 border border-surface-700/40 text-white text-sm placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!draft.trim() || sending}
                              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:bg-surface-800 disabled:text-surface-600 text-white text-sm font-bold transition-colors"
                            >
                              {t("send")}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto">
                          {members.map((m) => {
                            const canKick = isHost && m.user_id !== myUserId;
                            return (
                              <div
                                key={m.user_id}
                                className="flex items-center gap-3 px-4 py-3 border-b border-surface-800/30 last:border-0 hover:bg-surface-800/20 transition-colors"
                              >
                                <Link
                                  href={`/profile/${m.user_id}`}
                                  onClick={() => setOpen(false)}
                                >
                                  <Avatar
                                    src={m.avatar_url}
                                    name={m.username}
                                    size="md"
                                    className="rounded-xl"
                                  />
                                </Link>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium truncate">
                                    {m.username ?? "?"}
                                    {m.is_host && (
                                      <span className="ml-1.5 text-[10px] text-amber-300 font-bold">
                                        {t("host")}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                {canKick && (
                                  <button
                                    onClick={() => handleKick(m.user_id)}
                                    title={t("kick")}
                                    className="text-xs px-2 py-1 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                                  >
                                    {t("kick")}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
