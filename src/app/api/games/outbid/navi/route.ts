import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callLLM } from "@/lib/llm/openai";
import { logOpenAINaviUsage } from "@/lib/admin/usage-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/games/outbid/navi
 * Body : { roomId?: string, resultId?: string, locale?: 'fr' | 'en' }
 *
 * Génère le verdict de Navi (arbitre IA) pour une partie Outbid terminée.
 *
 * Deux modes :
 *   - `roomId` : mode "live" (juste après la partie). Lit l'état dans
 *     `game_rooms.config.outbid` et persiste via `outbid_save_navi_verdict`.
 *   - `resultId` : mode "feed rétroactif". Lit l'état dans
 *     `game_results.result_data` (la room peut avoir été nettoyée) et
 *     persiste via `outbid_save_navi_verdict_for_result`.
 *
 * Sécurité :
 *   - Auth requis (non-anonyme)
 *   - Premium uniquement
 *   - Doit être participant
 *   - Idempotent : retourne le verdict existant si déjà calculé
 */
export async function POST(req: Request) {
  let body: { roomId?: string; resultId?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const roomId = body.roomId?.trim();
  const resultId = body.resultId?.trim();
  if (!roomId && !resultId) {
    return NextResponse.json(
      { error: "missing_room_or_result_id" },
      { status: 400 }
    );
  }
  const locale = body.locale === "en" ? "en" : "fr";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Vérifie premium côté Next pour court-circuiter avant l'appel OpenAI
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

  // Sources de données harmonisées pour les deux modes
  type ExistingNavi = {
    verdict: string;
    locale?: string;
    authorName?: string;
    createdAt?: string;
  };
  let teamA: string[] = [];
  let teamB: string[] = [];
  let nameA = "Player A";
  let nameB = "Player B";
  let existingNavi: ExistingNavi | null = null;

  if (resultId) {
    // ─── Mode feed (rétroactif sur game_results) ──────────────────────────
    type ResultRow = {
      id: string;
      game_type: string;
      is_shared: boolean;
      result_data: Record<string, unknown> | null;
    };
    const { data: result, error: rErr } = await supabase
      .from("game_results")
      .select("id, game_type, is_shared, result_data")
      .eq("id", resultId)
      .maybeSingle<ResultRow>();
    if (rErr || !result) {
      return NextResponse.json({ error: "result_not_found" }, { status: 404 });
    }
    if (result.game_type !== "outbid") {
      return NextResponse.json({ error: "wrong_game_type" }, { status: 400 });
    }
    if (!result.is_shared) {
      return NextResponse.json({ error: "result_not_shared" }, { status: 400 });
    }

    const data = (result.result_data ?? {}) as Record<string, unknown>;
    type FeedTeamCard = { name: string };
    type FeedPlayer = { name?: string; team?: FeedTeamCard[] };
    const pA = (data.playerA ?? {}) as FeedPlayer;
    const pB = (data.playerB ?? {}) as FeedPlayer;
    nameA = pA.name ?? "Player A";
    nameB = pB.name ?? "Player B";
    teamA = (pA.team ?? []).map((c) => c?.name).filter((n): n is string => !!n);
    teamB = (pB.team ?? []).map((c) => c?.name).filter((n): n is string => !!n);

    existingNavi = (data.naviVerdict as ExistingNavi | null) ?? null;
  } else {
    // ─── Mode live (room directement après la partie) ─────────────────────
    type RoomRow = {
      id: string;
      phase: string;
      game_type: string;
      config: Record<string, unknown> | null;
    };
    const { data: room, error: roomErr } = await supabase
      .from("game_rooms")
      .select("id, phase, game_type, config")
      .eq("id", roomId!)
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

    const cfg = (room.config ?? {}) as Record<string, unknown>;
    const outbid = (cfg.outbid ?? {}) as Record<string, unknown>;
    existingNavi = (outbid.navi as ExistingNavi | null) ?? null;

    type CardRef = { id: string; name: string };
    type TeamEntry = { cardId: string; price: number };
    type PlayerSide = { name?: string; team?: TeamEntry[] };

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

    teamA = teamNames(playerA.team);
    teamB = teamNames(playerB.team);
    nameA = playerA.name ?? "Player A";
    nameB = playerB.name ?? "Player B";
  }

  // Si Navi a déjà tranché → renvoie l'existant sans rappeler OpenAI
  if (existingNavi && existingNavi.verdict) {
    return NextResponse.json({ ok: true, navi: existingNavi, cached: true });
  }

  if (teamA.length === 0 && teamB.length === 0) {
    return NextResponse.json({ error: "empty_teams" }, { status: 400 });
  }

  // 5) Prompt fr/en
  const teamABlock = teamA.map((n) => `- ${n}`).join("\n");
  const teamBBlock = teamB.map((n) => `- ${n}`).join("\n");

  const prompt =
    locale === "en"
      ? `Team ${nameA}:\n${teamABlock}\n\nTeam ${nameB}:\n${teamBBlock}`
      : `Équipe ${nameA} :\n${teamABlock}\n\nÉquipe ${nameB} :\n${teamBBlock}`;

  const systemPrompt =
    locale === "en"
      ? `You are Navi, a friendly AI referee. Two teams of cards face each other, decide who wins.

Be sharp, specific, fun. Stay concise overall (around 120-180 words), but feel free to nuance when a card or matchup truly deserves it.

You can use light markdown (bold, lists). End with a line "**Winner: <team name>**".`
      : `Tu es Navi, un arbitre IA sympa. Deux équipes de cartes s'affrontent, désigne qui gagne.

Sois pertinent, précis, fun. Reste concis dans l'ensemble (autour de 120-180 mots), mais n'hésite pas à nuancer quand une carte ou un duel le mérite vraiment.

Tu peux utiliser un peu de markdown (gras, listes). Termine par une ligne « **Vainqueur : <nom de l'équipe>** ».`;

  // 6) Appel OpenAI
  // Plus de tokens car la sortie inclut désormais une mini-fiche stats +
  // une ligne d'impact par carte. Pour 2 équipes de 11 cartes max, on
  // prévoit large (le budget couvre aussi les reasoning tokens internes).
  const llm = await callLLM({
    // Override le modèle par défaut (env NAVI_MODEL) pour ce test.
    // gpt-5.4-nano est plus cher (~3x) mais nettement plus pertinent
    // sur le contenu d'arbitrage. Retirer la ligne `model:` pour
    // revenir à la variable d'environnement.
    model: "gpt-5.4-nano",
    // low suffit maintenant que le format est libre (pas de template
    // strict à respecter). Réduit la facture reasoning d'env. 2-3x.
    reasoningEffort: "low",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    maxTokens: 2500,
  });
  if (!llm.ok) {
    const detail = "error" in llm ? llm.error : "unknown";
    console.error("[navi] LLM error:", detail);
    return NextResponse.json(
      { error: "llm_failed", detail },
      { status: 502 }
    );
  }

  // Logging d'usage (fire-and-forget, ne bloque pas la réponse)
  logOpenAINaviUsage({
    userId: user.id,
    promptTokens: llm.promptTokens,
    completionTokens: llm.completionTokens,
    model: llm.model,
    metadata: {
      mode: resultId ? "result" : "room",
      locale,
      team_a_size: teamA.length,
      team_b_size: teamB.length,
    },
  });

  // Persiste le verdict via la bonne RPC selon le mode
  const { data: saved, error: saveErr } = resultId
    ? await supabase.rpc("outbid_save_navi_verdict_for_result", {
        p_result_id: resultId,
        p_verdict: llm.text,
        p_locale: locale,
      })
    : await supabase.rpc("outbid_save_navi_verdict", {
        p_room_id: roomId!,
        p_verdict: llm.text,
        p_locale: locale,
      });

  if (saveErr) {
    console.error("[navi] save error:", saveErr);
    const msg = saveErr.message || "save_failed";
    const status = msg.includes("not_premium")
      ? 403
      : msg.includes("not_participant")
        ? 403
        : msg.includes("not_in_result") || msg.includes("result_not_shared")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true, navi: saved, cached: false });
}
