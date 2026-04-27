"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  type RemoteParticipant,
  type Participant,
} from "livekit-client";

// ────────────────────────────────────────────────────────────────────────────
// useGroupVoice — singleton module-level
// ────────────────────────────────────────────────────────────────────────────
// Comme `useGroup`, plusieurs composants peuvent monter ce hook en même temps
// (panel, mini-overlay, in-game). On partage donc UNE seule `Room` LiveKit
// par groupe et on broadcast les updates aux subscribers React.
// ────────────────────────────────────────────────────────────────────────────

export type VoiceParticipantMeta = {
  identity: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
  isLocal: boolean;
  isMicEnabled: boolean;
  mutedByHost: boolean;
  isSpeaking: boolean;
  audioLevel: number;
};

export type VoiceSnapshot = {
  groupId: string | null;
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  selfIdentity: string | null;
  isMicEnabled: boolean;
  mutedByHost: boolean;
  participants: VoiceParticipantMeta[];
};

const initialSnapshot: VoiceSnapshot = {
  groupId: null,
  status: "idle",
  error: null,
  selfIdentity: null,
  isMicEnabled: false,
  mutedByHost: false,
  participants: [],
};

let sharedRoom: Room | null = null;
let sharedGroupId: string | null = null;
let sharedSelfIdentity: string | null = null;
let snapshot: VoiceSnapshot = initialSnapshot;

const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

function parseMetadata(metadata: string | undefined): {
  avatarUrl: string | null;
  isHost: boolean;
} {
  if (!metadata) return { avatarUrl: null, isHost: false };
  try {
    const parsed = JSON.parse(metadata) as {
      avatar_url?: string | null;
      is_host?: boolean;
    };
    return {
      avatarUrl: parsed.avatar_url ?? null,
      isHost: Boolean(parsed.is_host),
    };
  } catch {
    return { avatarUrl: null, isHost: false };
  }
}

function buildParticipantMeta(p: Participant, isLocal: boolean): VoiceParticipantMeta {
  const meta = parseMetadata(p.metadata);
  return {
    identity: p.identity,
    name: p.name ?? p.identity,
    avatarUrl: meta.avatarUrl,
    isHost: meta.isHost,
    isLocal,
    isMicEnabled: p.isMicrophoneEnabled,
    mutedByHost: p.permissions ? !p.permissions.canPublish : false,
    isSpeaking: p.isSpeaking,
    audioLevel: p.audioLevel,
  };
}

function rebuildSnapshot() {
  if (!sharedRoom || !sharedGroupId) {
    snapshot = initialSnapshot;
    return;
  }
  const local = sharedRoom.localParticipant;
  const remotes: RemoteParticipant[] = Array.from(
    sharedRoom.remoteParticipants.values()
  );
  const participants: VoiceParticipantMeta[] = [
    buildParticipantMeta(local, true),
    ...remotes.map((p) => buildParticipantMeta(p, false)),
  ];
  participants.sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return a.name.localeCompare(b.name);
  });

  const localMeta = participants.find((p) => p.isLocal);
  const status: VoiceSnapshot["status"] =
    sharedRoom.state === ConnectionState.Connected
      ? "connected"
      : sharedRoom.state === ConnectionState.Connecting ||
          sharedRoom.state === ConnectionState.Reconnecting ||
          sharedRoom.state === ConnectionState.SignalReconnecting
        ? "connecting"
        : "idle";

  snapshot = {
    groupId: sharedGroupId,
    status,
    error: null,
    selfIdentity: sharedSelfIdentity,
    isMicEnabled: localMeta?.isMicEnabled ?? false,
    mutedByHost: localMeta?.mutedByHost ?? false,
    participants,
  };
}

function rebuildAndNotify() {
  rebuildSnapshot();
  notify();
}

function attachListeners(room: Room) {
  const events: RoomEvent[] = [
    RoomEvent.Connected,
    RoomEvent.Reconnected,
    RoomEvent.Reconnecting,
    RoomEvent.Disconnected,
    RoomEvent.ConnectionStateChanged,
    RoomEvent.ParticipantConnected,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
    RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished,
    RoomEvent.ParticipantPermissionsChanged,
    RoomEvent.ParticipantMetadataChanged,
    RoomEvent.ActiveSpeakersChanged,
  ];
  for (const ev of events) {
    room.on(ev, rebuildAndNotify);
  }
}

async function joinVoice(groupId: string): Promise<void> {
  // Si on est déjà connecté à un autre groupe, on quitte d'abord. Le user
  // singleton « 1 groupe à la fois » garantit que ça ne devrait pas arriver
  // souvent, mais on gère le cas par sécurité.
  if (sharedRoom && sharedGroupId && sharedGroupId !== groupId) {
    await leaveVoice();
  }
  if (sharedRoom && sharedGroupId === groupId) {
    return;
  }

  snapshot = {
    ...snapshot,
    status: "connecting",
    error: null,
    groupId,
  };
  notify();

  let token: string;
  let url: string;
  let identity: string;
  try {
    const res = await fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `token_failed_${res.status}`);
    }
    const data = (await res.json()) as {
      token: string;
      url: string;
      identity: string;
    };
    token = data.token;
    url = data.url;
    identity = data.identity;
  } catch (err) {
    snapshot = {
      ...snapshot,
      status: "error",
      error: err instanceof Error ? err.message : "token_failed",
    };
    notify();
    return;
  }

  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    publishDefaults: {
      red: true,
      stopMicTrackOnMute: false,
    },
  });
  attachListeners(room);

  try {
    await room.connect(url, token, { autoSubscribe: true });
    // Mute par défaut : pas de surprise audio à l'arrivée. L'utilisateur
    // active explicitement son micro avec le bouton de toggle.
    await room.localParticipant.setMicrophoneEnabled(false);
  } catch (err) {
    try {
      await room.disconnect();
    } catch {
      /* ignore */
    }
    snapshot = {
      ...snapshot,
      status: "error",
      error: err instanceof Error ? err.message : "connect_failed",
    };
    notify();
    return;
  }

  sharedRoom = room;
  sharedGroupId = groupId;
  sharedSelfIdentity = identity;
  rebuildAndNotify();
}

async function leaveVoice(): Promise<void> {
  if (!sharedRoom) {
    snapshot = initialSnapshot;
    notify();
    return;
  }
  try {
    await sharedRoom.disconnect();
  } catch {
    /* ignore */
  }
  sharedRoom = null;
  sharedGroupId = null;
  sharedSelfIdentity = null;
  snapshot = initialSnapshot;
  notify();
}

async function toggleMic(): Promise<void> {
  if (!sharedRoom) return;
  // Si l'host nous a soft-muté, le serveur refusera la republication. On
  // bloque ici aussi pour éviter une erreur visible.
  const lp = sharedRoom.localParticipant;
  if (lp.permissions && !lp.permissions.canPublish) {
    return;
  }
  const enabled = lp.isMicrophoneEnabled;
  try {
    await lp.setMicrophoneEnabled(!enabled);
  } catch (err) {
    console.error("[useGroupVoice] toggleMic failed", err);
  }
  rebuildAndNotify();
}

async function hostMute(
  groupId: string,
  targetUserId: string,
  canPublish: boolean
): Promise<void> {
  const res = await fetch("/api/livekit/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, targetUserId, canPublish }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `permission_failed_${res.status}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// React hook
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param activeGroupId - id du groupe courant de l'utilisateur, ou null s'il
 *   n'est plus dans aucun groupe. Quand il change ou passe à null, on force la
 *   déconnexion vocale (sécurité : on n'écoute pas dans le room d'un groupe
 *   qu'on a quitté).
 */
export function useGroupVoice(activeGroupId: string | null) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick((t) => (t + 1) & 0xffff);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  // Si l'utilisateur quitte ou change de groupe, on coupe le vocal.
  useEffect(() => {
    if (!activeGroupId && sharedRoom) {
      leaveVoice();
    } else if (
      activeGroupId &&
      sharedGroupId &&
      sharedGroupId !== activeGroupId
    ) {
      leaveVoice();
    }
  }, [activeGroupId]);

  const join = useCallback(() => {
    if (!activeGroupId) return Promise.resolve();
    return joinVoice(activeGroupId);
  }, [activeGroupId]);

  const muteMember = useCallback(
    (targetUserId: string, canPublish: boolean) => {
      if (!activeGroupId) return Promise.resolve();
      return hostMute(activeGroupId, targetUserId, canPublish);
    },
    [activeGroupId]
  );

  return {
    ...snapshot,
    join,
    leave: leaveVoice,
    toggleMic,
    muteMember,
  };
}
