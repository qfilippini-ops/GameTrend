"use client";

/**
 * Salle d'attente Outbid online (1v1).
 *
 * Pont entre la brique générique `RoomWaitingShell` et :
 *   - `OutbidRoomSettings` (édition par l'hôte, debounce → server)
 *   - Server Action `startOutbidGame`
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import RoomWaitingShell, {
  type RoomWaitingShellLabels,
} from "@/games/online/components/RoomWaitingShell";
import OutbidRoomSettings, {
  type OutbidRoomSettingsValue,
} from "@/games/outbid/components/online/OutbidRoomSettings";
import {
  startOutbidGame,
  updateOutbidSettings,
} from "@/app/actions/outbid-rooms";
import {
  OUTBID_TOUR_DEFAULT_SECONDS,
  OUTBID_TEAM_DEFAULT,
  OUTBID_MIN_PLAYERS,
  OUTBID_MAX_PLAYERS,
  type OutbidOpeningBidder,
} from "@/games/outbid/online-config";
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

function readSettings(room: OnlineRoom): OutbidRoomSettingsValue {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = (cfg.outbid_settings ?? {}) as Partial<OutbidRoomSettingsValue>;
  return {
    presetId: typeof s.presetId === "string" ? s.presetId : "",
    teamSize: typeof s.teamSize === "number" ? s.teamSize : OUTBID_TEAM_DEFAULT,
    tourTimeSeconds:
      typeof s.tourTimeSeconds === "number"
        ? s.tourTimeSeconds
        : OUTBID_TOUR_DEFAULT_SECONDS,
    openingBidder: (s.openingBidder as OutbidOpeningBidder) ?? "alternate",
  };
}

export default function OutbidRoomWaiting({
  room,
  players,
  myName,
  isHost,
  onlineNames,
  playerAvatars,
  onVoluntaryLeave,
}: Props) {
  const t = useTranslations("games.outbid.online.waiting");
  const tShared = useTranslations("games.outbid.online.waitingShared");
  const [settings, setSettings] = useState<OutbidRoomSettingsValue>(() =>
    readSettings(room)
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(true);
  const autoStartFiredRef = useRef(false);

  useEffect(() => {
    if (!isHost) {
      setSettings(readSettings(room));
    }
  }, [room.config, isHost]);

  useEffect(() => {
    const cfg = (room.config ?? {}) as { auto_start?: boolean };
    if (!isHost || !cfg.auto_start || autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    const supabase = createClient();
    supabase
      .from("game_rooms")
      .update({ config: { ...cfg, auto_start: false } })
      .eq("id", room.id)
      .then(() => startOutbidGame(room.id));
  }, [room.config, isHost, room.id]);

  useEffect(() => {
    if (!isHost) return;
    if (initRef.current) {
      initRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateOutbidSettings(room.id, {
        presetId: settings.presetId || null,
        teamSize: settings.teamSize,
        tourTimeSeconds: settings.tourTimeSeconds,
        openingBidder: settings.openingBidder,
      }).catch((e) => console.error("[updateOutbidSettings]", e));
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
    playersCapSuffix: (cap: number) => tShared("playersCapSuffix", { cap }),
    host: tShared("host"),
    you: tShared("you"),
    offline: tShared("offline"),
    kickTitle: (name: string) => tShared("kickTitle", { name }),
    settings: tShared("settings"),
    close: tShared("close"),
    edit: tShared("edit"),
    minPlayersHint: (min: number) => tShared("minPlayersHint", { min }),
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
      minPlayers={OUTBID_MIN_PLAYERS}
      maxPlayers={OUTBID_MAX_PLAYERS}
      labels={labels}
      renderSettings={() => (
        <OutbidRoomSettings value={settings} onChange={setSettings} compact />
      )}
      onStart={async () => {
        const res = await startOutbidGame(room.id);
        if (res?.error) return { error: res.error };
        return {};
      }}
      onVoluntaryLeave={onVoluntaryLeave}
    />
  );
}
