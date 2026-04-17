"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface SubmitReportArgs {
  presetId: string;
  reason: string;
  details?: string;
  presetName?: string;
}

interface SubmitReportResult {
  success: boolean;
  error?: string;
}

export async function submitReport({
  presetId,
  reason,
  details,
}: SubmitReportArgs): Promise<SubmitReportResult> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Non authentifié" };
  }

  const { error: dbErr } = await supabase.from("reports").insert({
    reporter_id: user.id,
    preset_id: presetId,
    reason,
    details: details?.trim() || null,
  });

  if (dbErr) {
    if (dbErr.code === "23505") {
      return { success: false, error: "Tu as déjà signalé ce preset." };
    }
    return { success: false, error: "Erreur lors de l'envoi. Réessaie." };
  }

  return { success: true };
}
