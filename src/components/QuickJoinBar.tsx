"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function QuickJoinBar() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) { setError("Code invalide (6 caractères)"); return; }
    setLoading(true);
    setError("");

    // Vérifier que le salon existe
    const supabase = createClient();
    const { data: room } = await supabase
      .from("game_rooms")
      .select("id, phase, game_type")
      .eq("id", c)
      .maybeSingle();

    if (!room) {
      setError("Salon introuvable");
      setLoading(false);
      return;
    }
    if (room.phase !== "lobby") {
      setError("La partie a déjà commencé");
      setLoading(false);
      return;
    }

    // Rediriger vers la page de la room (gère le join et l'auth anonyme)
    router.push(`/games/${room.game_type}/online/${c}`);
  }

  return (
    <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-3">
      <p className="text-surface-500 text-xs font-medium mb-2 px-1">
        🔗 Rejoindre un salon
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Code · ex: AB3X9K"
          maxLength={6}
          className="flex-1 bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/60 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest outline-none transition-all uppercase"
        />
        <button
          onClick={handleJoin}
          disabled={loading || code.length !== 6}
          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-800 disabled:text-surface-600 text-white font-bold rounded-xl transition-colors text-sm shrink-0"
        >
          {loading ? "…" : "→"}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-1.5 px-1">{error}</p>}
    </div>
  );
}
