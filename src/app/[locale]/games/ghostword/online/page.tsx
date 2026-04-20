"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import { createRoom, leaveAllOtherRooms } from "@/app/actions/rooms";
import { useAuth } from "@/hooks/useAuth";

function OnlineLobbyContent() {
  const t = useTranslations("games.ghostword.online");
  const router = useRouter();
  const params = useSearchParams();
  const { user, profile } = useAuth();

  const presetIds = params.get("presetIds") || "";
  const ombrePercent = Number(params.get("ombrePercent") ?? 90);
  const discussionTurns = Number(params.get("discussionTurns") ?? 2);

  const [tab, setTab] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [speakerDuration, setSpeakerDuration] = useState(30);
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Joueur avec un vrai compte : pseudo automatique, pas de saisie
  const isFullAccount = !!user && !user.is_anonymous && !!profile?.username;
  // Le pseudo effectif : username du profil si connecté, sinon la saisie manuelle
  const effectiveName = isFullAccount ? profile!.username! : displayName.trim();

  async function handleCreate() {
    if (!effectiveName) {
      setError(t("errEnterNick"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      // leaveAllOtherRooms est appelé dans createRoom (server-side)
      const res = await createRoom({
        gameType: "ghostword",
        presetIds: presetIds ? presetIds.split(",").filter(Boolean) : [],
        ombrePercent,
        discussionTurns,
        speakerDuration,
        isPrivate,
      });
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      router.push(`/games/ghostword/online/${res.code}`);
    } catch (e) {
      console.error(e);
      setError(t("errServer"));
      setLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    const name = effectiveName;
    if (!code || code.length !== 6) {
      setError(t("errInvalidCode"));
      return;
    }
    if (!name) {
      setError(t("errEnterNick"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Auth anonyme côté client si pas connecté
      const supabase = (await import("@/lib/supabase/client")).createClient();
      let { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const { data, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr || !data.user) {
          setError(t("errAuth", { message: anonErr?.message ?? "unknown" }));
          setLoading(false);
          return;
        }
        user = data.user;
        // Synchroniser la session dans un cookie pour les Server Actions
        if (data.session) {
          await fetch("/api/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          });
        }
      }

      // Vérifier la room
      const { data: room } = await supabase
        .from("game_rooms")
        .select("phase")
        .eq("id", code)
        .maybeSingle();
      if (!room) { setError(t("errRoomNotFound")); setLoading(false); return; }
      if (room.phase !== "lobby") { setError(t("errAlreadyStarted")); setLoading(false); return; }

      // Reconnexion ?
      const { data: alreadyIn } = await supabase
        .from("room_players")
        .select("display_name")
        .eq("room_id", code)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alreadyIn) {
        // Quitter les autres lobbies côté serveur (session cookie garantie)
        await leaveAllOtherRooms(code);
        // Pseudo pris ?
        const { data: taken } = await supabase
          .from("room_players")
          .select("display_name")
          .eq("room_id", code)
          .eq("display_name", name)
          .maybeSingle();
        if (taken) { setError(t("errNickTaken")); setLoading(false); return; }

        const { count } = await supabase
          .from("room_players")
          .select("*", { count: "exact", head: true })
          .eq("room_id", code);
        const { error: insertErr } = await supabase.from("room_players").insert({
          room_id: code,
          user_id: user.id,
          display_name: name,
          is_host: false,
          join_order: count ?? 1,
        });
        if (insertErr) { setError(insertErr.message); setLoading(false); return; }
      }

      router.push(`/games/ghostword/online/${code}`);
    } catch (e) {
      console.error(e);
      setError(t("errServer"));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header title={t("lobbyTitle")} backHref="/games/ghostword" />

      <div className="px-4 pt-4 pb-8 space-y-4">

        {/* Toggle Créer / Rejoindre */}
        <div className="flex bg-surface-900/60 border border-surface-700/30 rounded-2xl p-1 gap-1">
          {(["create", "join"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError(""); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-bold transition-all ${
                tab === tabKey
                  ? "bg-gradient-brand text-white glow-brand"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              {tabKey === "create" ? t("tabCreate") : t("tabJoin")}
            </button>
          ))}
        </div>

        {/* Pseudo — auto si compte complet, saisie sinon */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4"
        >
          {isFullAccount ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-300 text-sm font-bold shrink-0">
                {profile!.username!.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-white font-display font-bold text-sm leading-tight">
                  {profile!.username}
                </p>
                <p className="text-surface-500 text-xs mt-0.5">{t("yourAccount")}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-950/50 text-emerald-400 border border-emerald-700/30">✓</span>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-white font-display font-bold text-sm">
                {t("yourNickname")}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("nicknamePlaceholder")}
                maxLength={20}
                className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              />
            </div>
          )}
        </motion.div>

        {/* Code à rejoindre */}
        {tab === "join" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3"
          >
            <label className="text-white font-display font-bold text-sm">
              {t("roomCodeLabel")}
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t("roomCodePlaceholder")}
              maxLength={6}
              className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest outline-none transition-all uppercase"
            />
          </motion.div>
        )}

        {/* Paramètre timer (création seulement) */}
        {tab === "create" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-display font-bold text-sm">{t("timerPerPlayer")}</p>
                <p className="text-surface-500 text-xs mt-0.5">{t("timerHint")}</p>
              </div>
              <span className="text-2xl font-display font-bold text-brand-300">{speakerDuration}s</span>
            </div>
            <div className="flex items-center gap-3">
              {[15, 20, 30, 45, 60].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeakerDuration(s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    speakerDuration === s
                      ? "bg-brand-600 text-white"
                      : "bg-surface-800 text-surface-400 hover:text-white"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
            <div className="text-xs text-surface-600 text-center">
              {t("configHerited", { turns: discussionTurns, ombre: ombrePercent })}
            </div>
          </motion.div>
        )}

        {/* Visibilité du salon */}
        {tab === "create" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3"
          >
            <div>
              <p className="text-white font-display font-bold text-sm">{t("visibility")}</p>
              <p className="text-surface-500 text-xs mt-0.5">
                {isPrivate ? t("visibilityPrivate") : t("visibilityPublic")}
              </p>
            </div>
            <div className="flex bg-surface-800/60 rounded-xl p-1 gap-1">
              <button
                onClick={() => setIsPrivate(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  isPrivate ? "bg-surface-700 text-white" : "text-surface-500 hover:text-white"
                }`}
              >
                {t("private")}
              </button>
              <button
                onClick={() => setIsPrivate(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  !isPrivate ? "bg-brand-600 text-white" : "text-surface-500 hover:text-white"
                }`}
              >
                {t("public")}
              </button>
            </div>
          </motion.div>
        )}

        {/* Erreur */}
        {error && (
          <p className="text-red-400 text-sm text-center bg-red-950/30 border border-red-800/30 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        {/* CTA */}
        <motion.button
          onClick={tab === "create" ? handleCreate : handleJoin}
          disabled={loading}
          whileTap={{ scale: 0.97 }}
          className="w-full py-5 rounded-2xl font-display font-bold text-lg bg-gradient-brand text-white glow-brand hover:opacity-92 transition-all disabled:opacity-50"
        >
          {loading
            ? t("loadingShort")
            : tab === "create"
            ? t("createCta")
            : t("joinCta")}
        </motion.button>

        {!user && (
          <p className="text-surface-600 text-xs text-center">
            {t("anonHint")}{" "}
            <Link href="/auth/login" className="text-brand-400 underline">
              {t("loginCta")}
            </Link>{" "}
            {t("loginSuffix")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function OnlineLobbyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-950 flex items-center justify-center text-white" />}>
      <OnlineLobbyContent />
    </Suspense>
  );
}
