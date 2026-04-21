import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCustomerPortalUrl } from "@/lib/lemon/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portal/lemon
 *
 * Retourne l'URL du Customer Portal Lemon Squeezy pour l'utilisateur connecté.
 * Utilisé depuis la section "Mon abonnement" du profil pour la gestion du
 * moyen de paiement, l'annulation et le téléchargement de factures.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ls_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.ls_customer_id) {
    return NextResponse.json({ error: "no_customer" }, { status: 404 });
  }

  const url = await getCustomerPortalUrl(profile.ls_customer_id);
  if (!url) {
    return NextResponse.json({ error: "portal_unavailable" }, { status: 502 });
  }

  return NextResponse.json({ url });
}
