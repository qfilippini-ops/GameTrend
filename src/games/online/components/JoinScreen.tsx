"use client";

/**
 * Écran de jonction d'une room (générique, partagé par tous les jeux online).
 *
 * Comportements :
 *   - Auto-join si l'utilisateur est connecté avec un compte complet (username défini)
 *   - Sinon, saisie manuelle du pseudo
 *   - Auth anonyme transparente si non connecté
 *
 * Les libellés sont passés en props pour rester découplé d'un namespace i18n.
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { leaveAllOtherRooms } from "@/app/actions/rooms";

export interface JoinScreenLabels {
  salon: string;
  yourNickname: string;
  nicknamePlaceholder: string;
  joinCta: string;
  loading: string;
  connecting: string;
  errEnterNick: string;
  errRoomNotFound: string;
  errAlreadyStarted: string;
  errNickTaken: string;
  errAuth: (message: string) => string;
}

interface JoinScreenProps {
  code: string;
  labels: JoinScreenLabels;
  onJoined: (displayName: string) => void;
}

export default function JoinScreen({ code, labels, onJoined }: JoinScreenProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function tryAutoJoin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.username) return;
      setAutoJoining(true);
      await doJoin(user, profile.username);
    }
    tryAutoJoin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doJoin(knownUser: { id: string }, knownName: string) {
    const n = knownName.trim();
    if (!n) return;

    const { data: room } = await supabase
      .from("game_rooms")
      .select("phase")
      .eq("id", code)
      .maybeSingle();
    if (!room) {
      setError(labels.errRoomNotFound);
      setAutoJoining(false);
      setLoading(false);
      return;
    }
    if (room.phase !== "lobby") {
      setError(labels.errAlreadyStarted);
      setAutoJoining(false);
      setLoading(false);
      return;
    }

    const { data: alreadyIn } = await supabase
      .from("room_players")
      .select("display_name")
      .eq("room_id", code)
      .eq("user_id", knownUser.id)
      .maybeSingle();
    if (alreadyIn) {
      onJoined(alreadyIn.display_name);
      return;
    }

    await leaveAllOtherRooms(code);

    const { data: taken } = await supabase
      .from("room_players")
      .select("display_name")
      .eq("room_id", code)
      .eq("display_name", n)
      .maybeSingle();
    if (taken) {
      setError(labels.errNickTaken);
      setAutoJoining(false);
      setLoading(false);
      return;
    }

    const { count } = await supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", code);
    const { error: insertErr } = await supabase.from("room_players").insert({
      room_id: code,
      user_id: knownUser.id,
      display_name: n,
      is_host: false,
      join_order: count ?? 1,
    });
    if (insertErr) {
      setError(insertErr.message);
      setAutoJoining(false);
      setLoading(false);
      return;
    }

    onJoined(n);
  }

  async function handleJoin() {
    const n = name.trim();
    if (!n) {
      setError(labels.errEnterNick);
      return;
    }
    setLoading(true);
    setError("");

    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const { data, error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr || !data.user) {
        setError(labels.errAuth(anonErr?.message ?? "unknown"));
        setLoading(false);
        return;
      }
      user = data.user;
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

    await doJoin(user, n);
    setLoading(false);
  }

  if (autoJoining && !error) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{labels.connecting}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <p className="text-surface-500 text-xs uppercase tracking-widest mb-2">{labels.salon}</p>
          <h1 className="text-4xl font-display font-bold text-white tracking-widest">{code}</h1>
        </div>
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/60 p-4 space-y-3">
          <label className="text-white font-display font-bold text-sm">{labels.yourNickname}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder={labels.nicknamePlaceholder}
            maxLength={20}
            autoFocus
            className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full py-4 rounded-2xl font-display font-bold text-lg bg-gradient-brand text-white glow-brand hover:opacity-92 disabled:opacity-50 transition-all"
        >
          {loading ? labels.loading : labels.joinCta}
        </button>
      </div>
    </div>
  );
}
