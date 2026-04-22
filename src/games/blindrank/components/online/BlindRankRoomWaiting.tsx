"use client";

/**
 * Salle d'attente Blind Rank online.
 *
 * Fait le pont entre la brique générique `RoomWaitingShell` et :
 *   - le composant `BlindRankRoomSettings` (édition par l'hôte, debounce → server)
 *   - la Server Action `startBlindRankGame`
 *
 * Lit l'état initial depuis `room.config.blindrank_settings`. Tout changement
 * par l'hôte est propagé via `updateBlindRankSettings` avec un debounce 500ms
 * pour éviter de spammer le serveur.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import RoomWaitingShell, {
  type RoomWaitingShellLabels,
} from "@/games/online/components/RoomWaitingShell";
import BlindRankRoomSettings, {
  type BlindRankRoomSettingsValue,
} from "@/games/blindrank/components/online/BlindRankRoomSettings";
import {
  startBlindRankGame,
  updateBlindRankSettings,
  BLINDRANK_TOUR_DEFAULT_SECONDS,
  BLINDRANK_MIN_PLAYERS,
  BLINDRANK_MAX_PLAYERS,
  type BlindRankTieBreak,
} from "@/app/actions/blindrank-rooms";
import { createClient } from "@/lib/supabase/client";
import type { OnlineRoom, RoomPlayer } from "@/types/rooms";

interface Props {
  room: OnlineRoom;
  players: RoomPlayer[];
  myName: string;
  isHost: boolean;
  onlineNames: Set<string>;
  playerAvatars: Record<string, string | null>;
  onVoluntaryLeave?: () => void;
}

function readSettings(room: OnlineRoom): BlindRankRoomSettingsValue {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = (cfg.blindrank_settings ?? {}) as Partial<BlindRankRoomSettingsValue>;
  return {
    presetId: typeof s.presetId === "string" ? s.presetId : "",
    rackSize: typeof s.rackSize === "number" ? s.rackSize : 10,
    tourTimeSeconds:
      typeof s.tourTimeSeconds === "number"
        ? s.tourTimeSeconds
        : BLINDRANK_TOUR_DEFAULT_SECONDS,
    tieBreak: (s.tieBreak as BlindRankTieBreak) ?? "low",
  };
}

export default function BlindRankRoomWaiting({
  room,
  players,
  myName,
  isHost,
  onlineNames,
  playerAvatars,
  onVoluntaryLeave,
}: Props) {
  const t = useTranslations("games.blindrank.online.waiting");
  const tShared = useTranslations("games.blindrank.online.waitingShared");
  const [settings, setSettings] = useState<BlindRankRoomSettingsValue>(() =>
    readSettings(room)
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(true);
  const autoStartFiredRef = useRef(false);

  // Si la config change côté serveur (autre hôte / sync), on rafraîchit
  useEffect(() => {
    if (!isHost) {
      setSettings(readSettings(room));
    }
  }, [room.config, isHost]);

  // Auto-start après replay vote unanime
  useEffect(() => {
    const cfg = (room.config ?? {}) as { auto_start?: boolean };
    if (!isHost || !cfg.auto_start || autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    const supabase = createClient();
    supabase
      .from("game_rooms")
      .update({ config: { ...cfg, auto_start: false } })
      .eq("id", room.id)
      .then(() => startBlindRankGame(room.id));
  }, [room.config, isHost, room.id]);

  // Debounced push des settings vers le serveur (hôte uniquement)
  useEffect(() => {
    if (!isHost) return;
    if (initRef.current) {
      initRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateBlindRankSettings(room.id, {
        presetId: settings.presetId || null,
        rackSize: settings.rackSize,
        tourTimeSeconds: settings.tourTimeSeconds,
        tieBreak: settings.tieBreak,
      }).catch((e) => console.error("[updateBlindRankSettings]", e));
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings, isHost, room.id]);

  const labels: RoomWaitingShellLabels = {
    abandonReasonClose: tShared("abandonReasonClose"),
    roomCode: tShared("roomCode"),
    copyLink: tShared("copyLink"),
    copied: tShared("copied"),
    share: tShared("share"),
    shareTitle: tShared("shareTitle"),
    shareText: tShared("shareText"),
    players: tShared("players"),
    playersMinSuffix: (min: number) => tShared("playersMinSuffix", { min }),
    host: tShared("host"),
    you: tShared("you"),
    offline: tShared("offline"),
    kickTitle: (name: string) => tShared("kickTitle", { name }),
    settings: tShared("settings"),
    close: tShared("close"),
    edit: tShared("edit"),
    waitingForPlayers: (current: number, min: number) =>
      tShared("waitingForPlayers", { current, min }),
    starting: tShared("starting"),
    launch: (count: number) => t("launch", { count }),
    needPlayers: (min: number) => tShared("needPlayers", { min }),
    closeLobby: tShared("closeLobby"),
    closeLobbyConfirm: tShared("closeLobbyConfirm"),
    waitingHostStart: tShared("waitingHostStart"),
    leaveRoom: tShared("leaveRoom"),
  };

  return (
    <RoomWaitingShell
      room={room}
      players={players}
      myName={myName}
      isHost={isHost}
      onlineNames={onlineNames}
      playerAvatars={playerAvatars}
      minPlayers={BLINDRANK_MIN_PLAYERS}
      maxPlayers={BLINDRANK_MAX_PLAYERS}
      labels={labels}
      renderSettings={() => (
        <BlindRankRoomSettings
          value={settings}
          onChange={setSettings}
          compact
        />
      )}
      onStart={async () => {
        const res = await startBlindRankGame(room.id);
        if (res?.error) return { error: res.error };
        return {};
      }}
      onVoluntaryLeave={onVoluntaryLeave}
    />
  );
}
