/**
 * Templates HTML pour les emails Lemon Squeezy.
 * Style inline (compatible tous clients mail).
 *
 * 3 templates :
 *   - SubscriptionWelcome : bienvenue après checkout réussi
 *   - PaymentFailed       : alerte paiement échoué + CTA portail
 *   - SubscriptionCancelled : confirmation d'annulation + CTA réactivation
 */

import type { EmailLocale } from "./resend";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://gametrend.fr";

const COPY = {
  welcome: {
    fr: {
      subject: "Bienvenue dans GameTrend Premium 🎉",
      title: "Tu y es !",
      greeting: "Hello {{name}},",
      body:
        "Ton abonnement Premium est actif. Tu débloques l'accès à toutes les features pensées pour les créateurs : pas de pub, presets illimités, lien profil, bannière custom, badge Creator, presets épinglés, boost Explore et analytics détaillées.",
      cta: "Découvrir les features",
      ctaUrl: `${APP_URL}/fr/profile`,
      footer: "Tu peux gérer ton abonnement à tout moment depuis ton profil.",
    },
    en: {
      subject: "Welcome to GameTrend Premium 🎉",
      title: "You're in!",
      greeting: "Hi {{name}},",
      body:
        "Your Premium subscription is active. You unlock every creator-focused feature: no ads, unlimited presets, profile link, custom banner, Creator badge, pinned presets, Explore boost and detailed analytics.",
      cta: "Explore the features",
      ctaUrl: `${APP_URL}/en/profile`,
      footer: "You can manage your subscription anytime from your profile.",
    },
  },
  paymentFailed: {
    fr: {
      subject: "⚠️ Ton paiement GameTrend Premium a échoué",
      title: "Action requise",
      greeting: "Hello {{name}},",
      body:
        "On n'a pas pu prélever le renouvellement de ton abonnement. Pas de panique : tu as 7 jours pour mettre à jour ton moyen de paiement, ton compte reste Premium pendant ce délai.",
      cta: "Mettre à jour mon paiement",
      ctaUrl: "{{portalUrl}}",
      footer: "Sans action de ta part, ton compte basculera en Free dans 7 jours.",
    },
    en: {
      subject: "⚠️ Your GameTrend Premium payment failed",
      title: "Action needed",
      greeting: "Hi {{name}},",
      body:
        "We couldn't process your renewal. No worries: you have 7 days to update your payment method — your Premium access stays active in the meantime.",
      cta: "Update my payment",
      ctaUrl: "{{portalUrl}}",
      footer: "Without action, your account will switch back to Free in 7 days.",
    },
  },
  cancelled: {
    fr: {
      subject: "Abonnement GameTrend annulé",
      title: "À bientôt 👋",
      greeting: "Hello {{name}},",
      body:
        "Ton annulation est bien prise en compte. Tu gardes l'accès à toutes les features Premium jusqu'au {{endDate}}. Après cette date, ton compte basculera en Free — tes presets et tes données restent intacts.",
      cta: "Réactiver mon abonnement",
      ctaUrl: `${APP_URL}/fr/premium`,
      footer: "Si c'est une erreur ou si on peut faire mieux, réponds simplement à ce mail.",
    },
    en: {
      subject: "GameTrend subscription cancelled",
      title: "See you soon 👋",
      greeting: "Hi {{name}},",
      body:
        "Your cancellation is confirmed. You keep all Premium features until {{endDate}}. After that, your account switches back to Free — your presets and data stay intact.",
      cta: "Reactivate my subscription",
      ctaUrl: `${APP_URL}/en/premium`,
      footer: "If it was a mistake or if we can do better, just reply to this email.",
    },
  },
} as const;

function shell(content: string, accentHex = "#a78bfa"): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GameTrend</title>
</head>
<body style="margin:0;padding:0;background:#0a0b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b14;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#13141f;border:1px solid #1f2030;border-radius:18px;padding:32px;">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #1f2030;">
          <a href="${APP_URL}" style="text-decoration:none;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">
            GameTrend
          </a>
        </td></tr>
        <tr><td style="padding:24px 0;">
          ${content}
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #1f2030;font-size:12px;color:#6b7280;">
          <p style="margin:0;">GameTrend — Le rendez-vous des créateurs de presets de jeu.</p>
          <p style="margin:8px 0 0;">
            <a href="${APP_URL}" style="color:#9ca3af;text-decoration:underline;">${APP_URL.replace(/^https?:\/\//, "")}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:linear-gradient(135deg,#7c3aed,#ec4899);border-radius:12px;">
      <a href="${url}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

function fmtSubstitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export function welcomeEmail(opts: { locale: EmailLocale; name: string }) {
  const c = COPY.welcome[opts.locale];
  const html = shell(`
    <h1 style="margin:0 0 16px;font-size:26px;color:#fff;letter-spacing:-0.01em;">${c.title}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#d1d5db;">${fmtSubstitute(c.greeting, { name: opts.name })}</p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#d1d5db;">${c.body}</p>
    ${ctaButton(c.cta, c.ctaUrl)}
    <p style="margin:0;font-size:13px;color:#9ca3af;">${c.footer}</p>
  `);
  return {
    subject: c.subject,
    html,
    text: `${c.title}\n\n${fmtSubstitute(c.greeting, { name: opts.name })}\n\n${c.body}\n\n${c.ctaUrl}\n\n${c.footer}`,
  };
}

export function paymentFailedEmail(opts: { locale: EmailLocale; name: string; portalUrl: string }) {
  const c = COPY.paymentFailed[opts.locale];
  const html = shell(`
    <h1 style="margin:0 0 16px;font-size:26px;color:#fbbf24;letter-spacing:-0.01em;">${c.title}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#d1d5db;">${fmtSubstitute(c.greeting, { name: opts.name })}</p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#d1d5db;">${c.body}</p>
    ${ctaButton(c.cta, opts.portalUrl)}
    <p style="margin:0;font-size:13px;color:#9ca3af;">${c.footer}</p>
  `);
  return {
    subject: c.subject,
    html,
    text: `${c.title}\n\n${fmtSubstitute(c.greeting, { name: opts.name })}\n\n${c.body}\n\n${opts.portalUrl}\n\n${c.footer}`,
  };
}

export function cancelledEmail(opts: { locale: EmailLocale; name: string; endDate: string }) {
  const c = COPY.cancelled[opts.locale];
  const html = shell(`
    <h1 style="margin:0 0 16px;font-size:26px;color:#fff;letter-spacing:-0.01em;">${c.title}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#d1d5db;">${fmtSubstitute(c.greeting, { name: opts.name })}</p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#d1d5db;">${fmtSubstitute(c.body, { endDate: opts.endDate })}</p>
    ${ctaButton(c.cta, c.ctaUrl)}
    <p style="margin:0;font-size:13px;color:#9ca3af;">${c.footer}</p>
  `);
  return {
    subject: c.subject,
    html,
    text: `${c.title}\n\n${fmtSubstitute(c.greeting, { name: opts.name })}\n\n${fmtSubstitute(c.body, { endDate: opts.endDate })}\n\n${c.ctaUrl}\n\n${c.footer}`,
  };
}
