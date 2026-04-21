import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutUrl, LS_PLANS, type LemonPlan } from "@/lib/lemon/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout/lemon
 * Body : { plan: 'monthly' | 'yearly' | 'lifetime' }
 *
 * Crée un checkout Lemon Squeezy et retourne l'URL.
 * Embed possible côté client via le script LS overlay (window.LemonSqueezy).
 *
 * Sécurité :
 *   - Auth requis (anonymes refusés)
 *   - Lifetime refusé si user pas eligible
 */
export async function POST(req: Request) {
  let body: { plan?: LemonPlan };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || !["monthly", "yearly", "lifetime"].includes(plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const variantId = LS_PLANS[plan];
  if (!variantId) {
    return NextResponse.json({ error: "plan_not_configured" }, { status: 500 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Pour le lifetime, vérifier l'éligibilité (100 premiers comptes)
  if (plan === "lifetime") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("lifetime_eligible")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.lifetime_eligible) {
      return NextResponse.json({ error: "not_eligible" }, { status: 403 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const result = await createCheckoutUrl({
    variantId,
    userId: user.id,
    email: user.email,
    redirectUrl: `${appUrl}/profile?checkout=success`,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
