import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callLLM } from "@/lib/llm/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/games/outbid/navi
 * Body : { roomId: string, locale?: 'fr' | 'en' }
 *
 * Génère le verdict de Navi (arbitre IA) pour une partie Outbid terminée
 * et le persiste dans `game_rooms.config.outbid.navi` via la RPC
 * `outbid_save_navi_verdict` (idempotente, premium-only).
 *
 * Sécurité :
 *   - Auth requis
 *   - Premium uniquement (vérif côté SQL via is_premium dans la RPC)
 *   - Participation à la room (vérif côté SQL)
 *   - Idempotent : retourne le verdict existant si déjà calculé
 */
export async function POST(req: Request) {
  let body: { roomId?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const roomId = body.roomId?.trim();
  if (!roomId) {
    return NextResponse.json({ error: "missing_room_id" }, { status: 400 });
  }
  const locale = body.locale === "en" ? "en" : "fr";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 1) Charge la room et vérifie phase + game_type côté serveur
  type RoomRow = {
    id: string;
    phase: string;
    game_type: string;
    config: Record<string, unknown> | null;
  };
  const { data: room, error: roomErr } = await supabase
    .from("game_rooms")
    .select("id, phase, game_type, config")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomErr || !room) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }
  if (room.game_type !== "outbid") {
    return NextResponse.json({ error: "wrong_game_type" }, { status: 400 });
  }
  if (room.phase !== "result") {
    return NextResponse.json({ error: "not_in_result" }, { status: 400 });
  }

  // 2) Vérifie premium côté Next pour court-circuiter avant l'appel OpenAI
  type ProfileRow = { subscription_status: string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();
  const isPremium = profile?.subscription_status
    ? ["trialing", "active", "lifetime"].includes(profile.subscription_status)
    : false;
  if (!isPremium) {
    return NextResponse.json({ error: "not_premium" }, { status: 403 });
  }

  // 3) Si Navi a déjà tranché → renvoie l'existant sans rappeler OpenAI
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const outbid = (cfg.outbid ?? {}) as Record<string, unknown>;
  const existingNavi = outbid.navi as
    | { verdict: string; locale: string; authorName: string; createdAt: string }
    | null
    | undefined;
  if (existingNavi && existingNavi.verdict) {
    return NextResponse.json({ ok: true, navi: existingNavi, cached: true });
  }

  // 4) Récupère les noms des cartes des deux équipes pour le prompt
  type CardRef = { id: string; name: string };
  type TeamEntry = { cardId: string; price: number };
  type PlayerSide = {
    name?: string;
    points?: number;
    team?: TeamEntry[];
  };

  const cards = (outbid.cards ?? []) as CardRef[];
  const cardNameById = new Map<string, string>();
  cards.forEach((c) => {
    if (c?.id && typeof c.name === "string") cardNameById.set(c.id, c.name);
  });

  const playerA = (outbid.playerA ?? {}) as PlayerSide;
  const playerB = (outbid.playerB ?? {}) as PlayerSide;
  const teamNames = (entries: TeamEntry[] | undefined): string[] =>
    (entries ?? [])
      .map((e) => cardNameById.get(e.cardId))
      .filter((n): n is string => !!n);

  const teamA = teamNames(playerA.team);
  const teamB = teamNames(playerB.team);
  const nameA = playerA.name ?? "Player A";
  const nameB = playerB.name ?? "Player B";

  if (teamA.length === 0 && teamB.length === 0) {
    return NextResponse.json({ error: "empty_teams" }, { status: 400 });
  }

  // 5) Prompt fr/en
  const prompt =
    locale === "en"
      ? `Decide between these two teams in a clear and concise way. There must be a winner.\nTeam ${nameA}: ${teamA.join(", ")}\nTeam ${nameB}: ${teamB.join(", ")}`
      : `Départage ces deux équipes de manière claire et concise. Il faut un vainqueur.\nÉquipe ${nameA} : ${teamA.join(", ")}\nÉquipe ${nameB} : ${teamB.join(", ")}`;

  const systemPrompt =
    locale === "en"
      ? "You are Navi, a witty and fair AI referee for fantasy team duels. Always pick a single winner. Be punchy, max 4 short sentences. End with a clear verdict line: 'Winner: <name>'."
      : "Tu es Navi, un arbitre IA piquant et équitable pour des duels d'équipes fantasy. Choisis toujours un seul gagnant. Sois percutant, 4 phrases courtes max. Termine par une ligne verdict claire : « Vainqueur : <nom> ».";

  // 6) Appel OpenAI
  const llm = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    maxTokens: 500,
  });
  if (!llm.ok) {
    console.error("[navi] LLM error:", llm.error);
    return NextResponse.json(
      { error: "llm_failed", detail: llm.error },
      { status: 502 }
    );
  }

  // 7) Persiste le verdict via la RPC (premium + participation revérifiés)
  const { data: saved, error: saveErr } = await supabase.rpc(
    "outbid_save_navi_verdict",
    {
      p_room_id: roomId,
      p_verdict: llm.text,
      p_locale: locale,
    }
  );

  if (saveErr) {
    console.error("[navi] save error:", saveErr);
    const msg = saveErr.message || "save_failed";
    const status = msg.includes("not_premium")
      ? 403
      : msg.includes("not_participant")
        ? 403
        : msg.includes("not_in_result")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true, navi: saved, cached: false });
}
