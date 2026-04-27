import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

// ────────────────────────────────────────────────────────────────────────────
// LiveKit server helpers
// ────────────────────────────────────────────────────────────────────────────
// Centralise la création de tokens et l'accès au RoomServiceClient. Toutes les
// opérations (génération de JWT, mute soft host, etc.) passent par ici pour
// être sûres d'utiliser la même config que le serveur LiveKit auto-hébergé.
//
// Variables d'env requises (cf. docs/VOICE_SETUP.md) :
//   LIVEKIT_URL              wss://livekit.gametrend.app  (utilisé côté client)
//   LIVEKIT_API_KEY          API key générée par LiveKit
//   LIVEKIT_API_SECRET       Secret correspondant (32+ caractères)
// ────────────────────────────────────────────────────────────────────────────

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

export type GroupVoiceTokenInput = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  groupId: string;
  isHost: boolean;
  // canPublish=false signifie que le user a été soft-muté par l'host avant son
  // join (cas rare). Par défaut canPublish=true mais le micro est coupé côté
  // client à la connexion.
  canPublish?: boolean;
};

export function getGroupRoomName(groupId: string): string {
  return `group:${groupId}`;
}

export function isLiveKitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

export async function createGroupVoiceToken(
  input: GroupVoiceTokenInput
): Promise<string> {
  if (!isLiveKitConfigured()) {
    throw new Error("LiveKit not configured (missing env vars)");
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: input.userId,
    name: input.username,
    metadata: JSON.stringify({
      avatar_url: input.avatarUrl ?? null,
      is_host: input.isHost,
    }),
    ttl: 60 * 60 * 6,
  });

  at.addGrant({
    room: getGroupRoomName(input.groupId),
    roomJoin: true,
    canPublish: input.canPublish ?? true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });

  return at.toJwt();
}

// RoomServiceClient appelle l'API HTTP/HTTPS de LiveKit, pas la WS. On
// transforme donc wss:// → https:// (et ws:// → http:// pour le dev local).
function httpUrlFromLiveKitUrl(url: string): string {
  if (url.startsWith("wss://")) return "https://" + url.slice("wss://".length);
  if (url.startsWith("ws://")) return "http://" + url.slice("ws://".length);
  return url;
}

let cachedRoomService: RoomServiceClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!isLiveKitConfigured()) {
    throw new Error("LiveKit not configured (missing env vars)");
  }
  if (cachedRoomService) return cachedRoomService;
  cachedRoomService = new RoomServiceClient(
    httpUrlFromLiveKitUrl(LIVEKIT_URL),
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );
  return cachedRoomService;
}

/**
 * Soft mute : l'host retire la permission `canPublish` du membre cible. Le
 * membre reste connecté, entend les autres, mais son track audio n'est plus
 * accepté côté serveur tant qu'on ne ré-autorise pas. Réversible avec
 * canPublish=true.
 *
 * Ne fait rien si LiveKit n'est pas configuré (mode dev sans vocal) — utile
 * pour ne pas bloquer un déploiement preview qui n'aurait pas le secret.
 */
export async function setMemberPublishPermission(
  groupId: string,
  identity: string,
  canPublish: boolean
): Promise<void> {
  const room = getGroupRoomName(groupId);
  await getRoomService().updateParticipant(room, identity, {
    permission: {
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      hidden: false,
      recorder: false,
      canUpdateMetadata: false,
      canSubscribeMetrics: false,
      agent: false,
    },
  });
}

/**
 * Supprime le participant du room (ne le bannit pas — il peut rejoindre
 * à nouveau). Utilisé quand on quitte le groupe pour s'assurer que la session
 * vocale est nettoyée même si le client n'a pas pu déclencher le disconnect.
 */
export async function removeMemberFromRoom(
  groupId: string,
  identity: string
): Promise<void> {
  const room = getGroupRoomName(groupId);
  try {
    await getRoomService().removeParticipant(room, identity);
  } catch (err) {
    // Le participant n'est pas/plus dans le room → tant mieux, no-op.
    void err;
  }
}
