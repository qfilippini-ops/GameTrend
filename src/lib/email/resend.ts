/**
 * Wrapper Resend pour les emails transactionnels.
 *
 * Pas de SDK officiel installé pour rester léger : appel direct à l'API REST.
 * Doc : https://resend.com/docs/api-reference/emails/send-email
 *
 * Tous les templates sont en HTML brut (string templates) pour éviter la
 * dépendance à react-email qui complique la build Next.js. Si on veut passer
 * à react-email plus tard, ce wrapper reste compatible.
 */

const RESEND_API = "https://api.resend.com/emails";

export type EmailLocale = "fr" | "en";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "hello@gametrend.fr";

  if (!apiKey) {
    console.warn("[resend] RESEND_API_KEY manquant, email non envoyé");
    return { success: false, error: "missing_api_key" };
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `GameTrend <${from}>`,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
          reply_to: opts.replyTo,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        return { success: true, id: json?.id };
      }

      const errBody = await res.text();
      console.error(`[resend] tentative ${attempt}/3 échouée`, res.status, errBody);

      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { success: false, error: `resend_${res.status}` };
      }
    } catch (e) {
      console.error(`[resend] tentative ${attempt}/3 exception`, e);
    }

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  return { success: false, error: "max_retries" };
}
