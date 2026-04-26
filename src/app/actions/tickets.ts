"use server";

// Server action pour la création d'un ticket support (bug / idée / autre).
// Validation côté serveur via la RPC `create_ticket` (qui re-valide en SQL
// les CHECK constraints). Pas de UPDATE/DELETE côté user.

import { createClient } from "@/lib/supabase/server";
import {
  TICKET_BODY_MAX,
  TICKET_BODY_MIN,
  TICKET_MAX_ATTACHMENTS,
  TICKET_TITLE_MAX,
  TICKET_TITLE_MIN,
} from "@/lib/support/limits";

// Note : les constantes de limite sont volontairement gardées dans
// `@/lib/support/limits` (fichier non-server) car un fichier "use server"
// ne peut exporter QUE des fonctions async. Les types le peuvent.
export type TicketType = "bug" | "idea" | "other";

export interface CreateTicketResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function createTicket(
  type: TicketType,
  title: string,
  body: string,
  attachments: string[] = []
): Promise<CreateTicketResult> {
  try {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!["bug", "idea", "other"].includes(type)) {
      return { ok: false, error: "invalid_type" };
    }
    if (
      trimmedTitle.length < TICKET_TITLE_MIN ||
      trimmedTitle.length > TICKET_TITLE_MAX
    ) {
      return { ok: false, error: "invalid_title" };
    }
    if (
      trimmedBody.length < TICKET_BODY_MIN ||
      trimmedBody.length > TICKET_BODY_MAX
    ) {
      return { ok: false, error: "invalid_body" };
    }
    if (!Array.isArray(attachments) || attachments.length > TICKET_MAX_ATTACHMENTS) {
      return { ok: false, error: "too_many_attachments" };
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }

    // Garde-fou : on n'accepte que des paths qui démarrent par <user_id>/
    // (cohérent avec la policy storage). Les autres sont silencieusement
    // filtrés pour éviter qu'un client compromis ne référence des fichiers
    // d'autres users.
    const safeAttachments = attachments
      .filter(
        (p) => typeof p === "string" && p.length > 0 && p.length <= 500 && p.startsWith(`${user.id}/`)
      )
      .slice(0, TICKET_MAX_ATTACHMENTS);

    const { data, error } = await supabase.rpc("create_ticket", {
      p_type: type,
      p_title: trimmedTitle,
      p_body: trimmedBody,
      p_attachments: safeAttachments,
    });
    if (error) {
      console.error("[createTicket]", error);
      return { ok: false, error: error.message };
    }
    const payload = (data ?? {}) as { id?: string };
    return { ok: true, id: payload.id };
  } catch (e) {
    console.error("[createTicket] exception", e);
    return { ok: false, error: String(e) };
  }
}
