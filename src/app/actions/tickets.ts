"use server";

// Server action pour la création d'un ticket support (bug / idée / autre).
// Validation côté serveur via la RPC `create_ticket` (qui re-valide en SQL
// les CHECK constraints). Pas de UPDATE/DELETE côté user.

import { createClient } from "@/lib/supabase/server";
import {
  TICKET_BODY_MAX,
  TICKET_BODY_MIN,
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
  body: string
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

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }

    const { data, error } = await supabase.rpc("create_ticket", {
      p_type: type,
      p_title: trimmedTitle,
      p_body: trimmedBody,
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
