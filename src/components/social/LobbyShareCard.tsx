"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import type { GroupLobbyShareMessage } from "@/types/groups";

const ONLINE_GAMES = new Set(["ghostword", "blindrank", "dyp", "outbid"]);

const GAME_META: Record<
  string,
  { label: string; icon: string; gradient: string; ring: string }
> = {
  ghostword: {
    label: "GhostWord",
    icon: "👻",
    gradient: "from-violet-600/30 via-violet-700/15 to-transparent",
    ring: "ring-violet-500/40",
  },
  blindrank: {
    label: "BlindRank",
    icon: "📊",
    gradient: "from-cyan-600/30 via-cyan-700/15 to-transparent",
    ring: "ring-cyan-500/40",
  },
  dyp: {
    label: "DYP",
    icon: "🎯",
    gradient: "from-amber-600/30 via-amber-700/15 to-transparent",
    ring: "ring-amber-500/40",
  },
  outbid: {
    label: "Outbid",
    icon: "💰",
    gradient: "from-emerald-600/30 via-emerald-700/15 to-transparent",
    ring: "ring-emerald-500/40",
  },
};

/**
 * Produit la liste des "règles principales" à afficher selon le game_type.
 * Renvoie des labels courts (ex: "5 cartes/équipe", "60s/tour", "Bracket 8").
 * On garde la responsabilité du formatage côté client pour rester découplé
 * du SQL et pouvoir évoluer sans migration.
 */
function buildRules(
  gameType: string,
  config: Record<string, unknown> | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): string[] {
  if (!config) return [];

  // Helpers de lecture défensive (le payload vient d'un JSONB côté DB).
  const get = (path: string[]): unknown => {
    let cur: unknown = config;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in cur) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return cur;
  };
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const out: string[] = [];

  if (gameType === "ghostword") {
    const ombre = num(get(["ombrePercent"]));
    if (ombre !== null) out.push(t("rules.ghostword.ombre", { v: ombre }));
  } else if (gameType === "outbid") {
    const team = num(get(["outbid_settings", "teamSize"]));
    const tour = num(get(["outbid_settings", "tourTimeSeconds"]));
    if (team !== null) out.push(t("rules.outbid.team", { v: team }));
    if (tour !== null) out.push(t("rules.outbid.tour", { v: tour }));
  } else if (gameType === "dyp") {
    const bracket = num(get(["dyp_settings", "bracketSize"]));
    const tour = num(get(["dyp_settings", "tourTimeSeconds"]));
    if (bracket !== null) out.push(t("rules.dyp.bracket", { v: bracket }));
    if (tour !== null) out.push(t("rules.dyp.tour", { v: tour }));
  } else if (gameType === "blindrank") {
    const rack = num(get(["blindrank_settings", "rackSize"]));
    const tour = num(get(["blindrank_settings", "tourTimeSeconds"]));
    if (rack !== null) out.push(t("rules.blindrank.rack", { v: rack }));
    if (tour !== null) out.push(t("rules.blindrank.tour", { v: tour }));
  }

  return out;
}

interface Props {
  payload: GroupLobbyShareMessage["payload"];
  onJoin?: () => void;
}

export default function LobbyShareCard({ payload, onJoin }: Props) {
  const t = useTranslations("groups");
  const meta = GAME_META[payload.game_type] ?? {
    label: payload.game_type,
    icon: "🎮",
    gradient: "from-brand-600/30 via-brand-700/15 to-transparent",
    ring: "ring-brand-500/40",
  };
  const canJoin = ONLINE_GAMES.has(payload.game_type);
  const href = canJoin ? `/games/${payload.game_type}/online/${payload.code}` : null;
  const presets = payload.preset_names ?? [];
  const maxPlayers = payload.max_players ?? 0;
  const rules = buildRules(payload.game_type, payload.config, t);

  // ── Compte de joueurs en temps réel via Supabase Realtime ──
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function fetchCount() {
      const { count } = await supabase
        .from("room_players")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", payload.code);
      if (!cancelled) setPlayerCount(count ?? 0);
    }
    fetchCount();

    const channel = supabase
      .channel(`lobby_share_count:${payload.code}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${payload.code}`,
        },
        () => {
          if (!cancelled) fetchCount();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [payload.code]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-surface-800/80 ring-1 ${meta.ring} shadow-lg`}
    >
      {/* Halo dégradé du jeu */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} pointer-events-none`}
        aria-hidden
      />

      <div className="relative p-3">
        {/* Header : host + badge jeu */}
        <div className="flex items-center gap-2.5">
          <Avatar
            src={payload.host_avatar ?? null}
            name={payload.host_name}
            size="sm"
            className="rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold leading-tight truncate">
              {payload.host_name}
            </p>
            <p className="text-surface-400 text-[10px] leading-tight">
              {t("lobbyShareInvited")}
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-900/70 border border-surface-700/40 text-[10px] font-bold text-white">
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
        </div>

        {/* Players count + presets */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {maxPlayers > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand-600/25 border border-brand-500/40 text-[10px] font-bold text-brand-100"
              title={t("lobbyPlayersTooltip")}
            >
              <span aria-hidden>👥</span>
              {/*
                `share_lobby_to_group` est appelé juste après l'INSERT dans
                `game_rooms` mais AVANT que l'hôte ait validé son pseudo dans
                JoinScreen → `room_players` est encore vide pendant quelques
                secondes. On affiche donc au minimum 1 (l'hôte) tant que le
                count réel n'a pas dépassé ce seuil.
              */}
              <span>
                {playerCount === null
                  ? "·"
                  : Math.max(playerCount, 1)}
                /{maxPlayers}
              </span>
            </span>
          )}
          {presets.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-900/60 border border-surface-700/40 text-[10px] text-surface-200 max-w-[140px] truncate"
              title={name}
            >
              <span className="text-[8px] opacity-60">🎴</span>
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>

        {/* Rules */}
        {rules.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rules.map((r, i) => (
              <span
                key={`${r}-${i}`}
                className="inline-flex items-center px-2 py-0.5 rounded-lg bg-surface-900/40 border border-surface-700/30 text-[10px] text-surface-300"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Footer : visibilité + code + bouton rejoindre */}
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] text-surface-400">
            <span>{payload.is_private ? "🔒" : "🌐"}</span>
            <span>
              {payload.is_private ? t("lobbyPrivate") : t("lobbyPublic")}
            </span>
          </span>
          <span className="text-[10px] font-mono text-surface-500 tracking-wide">
            #{payload.code}
          </span>
          {href && (
            <Link
              href={href}
              onClick={onJoin}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[12px] font-bold px-3 py-1.5 transition-colors shadow-md"
            >
              {t("joinLobby")}
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
