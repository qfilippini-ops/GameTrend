"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type RemoteParticipant,
  type Participant,
  type RemoteTrack,
  type RemoteAudioTrack,
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
  /** Coupé localement par l'utilisateur courant (audio = 0 chez nous, mais
   *  l'autre continue de parler pour les autres). */
  isLocallyMuted: boolean;
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
// Erreur du dernier toggle micro (ex. permission denied). Persiste à travers
// les rebuildSnapshot() pour qu'on puisse l'afficher dans l'UI.
let micError: string | null = null;
// Erreur de la dernière action mute/unmute par l'host.
let hostMuteError: string | null = null;
// Mutes locaux : { identity → muted } — applique seulement chez nous, ne
// remonte pas au serveur. Persiste tant qu'on est dans la room.
const localMutes = new Set<string>();

const subscribers = new Set<() => void>();

// Audio elements créés pour chaque remote audio track. Sans ça, livekit-client
// ne joue PAS l'audio entrant (depuis SDK v2 il faut attacher manuellement).
const audioElements = new Map<string, HTMLAudioElement>();

function attachRemoteAudio(track: RemoteTrack) {
  if (track.kind !== Track.Kind.Audio) return;
  const audioTrack = track as RemoteAudioTrack;
  const el = audioTrack.attach();
  el.id = `lk-audio-${track.sid ?? Math.random().toString(36).slice(2)}`;
  el.autoplay = true;
  el.playsInline = true;
  el.style.display = "none";
  document.body.appendChild(el);
  if (track.sid) audioElements.set(track.sid, el);
  el.play().catch(() => {
    // Autoplay bloqué (rare car le user a cliqué pour rejoindre). On
    // ignore : le SDK retentera, et l'audio démarrera au prochain user
    // gesture.
  });
}

function detachRemoteAudio(track: RemoteTrack) {
  if (track.kind !== Track.Kind.Audio) return;
  if (!track.sid) return;
  const el = audioElements.get(track.sid);
  if (!el) return;
  try {
    track.detach(el);
  } catch {
    /* ignore */
  }
  el.remove();
  audioElements.delete(track.sid);
}

function detachAllRemoteAudio() {
  audioElements.forEach((el) => el.remove());
  audioElements.clear();
}

/**
 * Applique le local-mute à un participant remote : volume = 0 chez nous
 * mais le serveur continue de relayer son audio aux autres.
 */
function applyLocalMuteForParticipant(identity: string, muted: boolean) {
  if (!sharedRoom) return;
  const p = sharedRoom.remoteParticipants.get(identity);
  if (!p) return;
  try {
    p.setVolume(muted ? 0 : 1);
  } catch (err) {
    console.error("[useGroupVoice] setVolume failed", err);
  }
}

function setLocalMuteForIdentity(identity: string, muted: boolean) {
  if (muted) localMutes.add(identity);
  else localMutes.delete(identity);
  applyLocalMuteForParticipant(identity, muted);
  rebuildAndNotify();
}

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
    isLocallyMuted: !isLocal && localMutes.has(p.identity),
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
    error: micError ?? hostMuteError,
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

  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    attachRemoteAudio(track);
    // Si on avait local-muté ce participant avant qu'il publie, on
    // réapplique maintenant que sa track existe.
    if (
      track.kind === Track.Kind.Audio &&
      localMutes.has(participant.identity)
    ) {
      applyLocalMuteForParticipant(participant.identity, true);
    }
    rebuildAndNotify();
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    detachRemoteAudio(track);
    rebuildAndNotify();
  });
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
  detachAllRemoteAudio();
  localMutes.clear();
  micError = null;
  hostMuteError = null;
  sharedRoom = null;
  sharedGroupId = null;
  sharedSelfIdentity = null;
  snapshot = initialSnapshot;
  notify();
}

/**
 * Demande explicitement la permission micro via getUserMedia, sans toucher
 * au SDK LiveKit. Évite la race condition "setMicrophoneEnabled échoue à
 * la 1ère tentative parce que Chrome n'a pas fini d'afficher le pop-up".
 *
 * Retourne true si la permission est accordée (ou déjà accordée).
 */
async function ensureMicPermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // On libère immédiatement le stream : LiveKit ouvrira le sien au moment
    // de publier la track. Sans ça, on garde un track audio « fantôme »
    // ouvert qui n'est pas envoyé au serveur.
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[useGroupVoice] getUserMedia failed", name, msg);
    if (
      name === "NotAllowedError" ||
      /permission|denied|not allowed/i.test(msg)
    ) {
      micError = "mic_permission_denied";
    } else if (
      name === "NotFoundError" ||
      /no microphone|requested device/i.test(msg)
    ) {
      micError = "mic_not_found";
    } else {
      micError = "mic_failed";
    }
    return false;
  }
}

async function toggleMic(): Promise<void> {
  if (!sharedRoom) return;
  // Si l'host nous a soft-muté, le serveur refusera la republication. On
  // bloque ici aussi pour éviter une erreur visible.
  const lp = sharedRoom.localParticipant;
  if (lp.permissions && !lp.permissions.canPublish) {
    return;
  }

  const wantsToEnable = !lp.isMicrophoneEnabled;

  // Couper le micro : on n'a pas besoin de permission.
  if (!wantsToEnable) {
    try {
      await lp.setMicrophoneEnabled(false);
      micError = null;
    } catch (err) {
      console.error("[useGroupVoice] disable mic failed", err);
      micError = "mic_failed";
    }
    rebuildAndNotify();
    return;
  }

  // Activer le micro : on demande d'abord la permission OS via getUserMedia,
  // puis seulement après on publie la track LiveKit. Évite la race
  // condition « 1ère tentative échoue / 2ème marche ».
  const granted = await ensureMicPermission();
  if (!granted) {
    rebuildAndNotify();
    return;
  }

  try {
    await lp.setMicrophoneEnabled(true);
    micError = null;
  } catch (err) {
    console.error("[useGroupVoice] enable mic failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "";
    if (
      name === "NotAllowedError" ||
      /permission|denied|not allowed/i.test(msg)
    ) {
      micError = "mic_permission_denied";
    } else {
      micError = "mic_failed";
    }
  }
  rebuildAndNotify();
}

async function hostMute(
  groupId: string,
  targetUserId: string,
  canPublish: boolean
): Promise<void> {
  hostMuteError = null;
  rebuildAndNotify();
  let res: Response;
  try {
    res = await fetch("/api/livekit/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, targetUserId, canPublish }),
    });
  } catch (err) {
    console.error("[useGroupVoice] hostMute network error", err);
    hostMuteError = "host_mute_network";
    rebuildAndNotify();
    throw err;
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const code = data.error ?? `permission_failed_${res.status}`;
    console.error("[useGroupVoice] hostMute failed", code, res.status);
    hostMuteError = `host_mute:${code}`;
    rebuildAndNotify();
    throw new Error(code);
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

  const setLocalMute = useCallback(
    (targetUserId: string, muted: boolean) => {
      setLocalMuteForIdentity(targetUserId, muted);
    },
    []
  );

  return {
    ...snapshot,
    join,
    leave: leaveVoice,
    toggleMic,
    muteMember,
    setLocalMute,
  };
}
