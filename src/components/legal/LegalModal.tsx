"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type LegalType = "cgu" | "privacy" | "mentions" | "cgv";

const CONTENT_FR: Record<LegalType, React.ReactNode> = {
  cgu: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <section><h3 className="text-white font-bold mb-1">1. Objet</h3>
        <p>Les présentes CGU régissent l&apos;accès et l&apos;utilisation de <strong className="text-white">GameTrend</strong> (gametrend.fr), édité par Quentin Filippini, micro-entrepreneur (SIRET : 89181769400021).</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">2. Description du service</h3>
        <p>Plateforme de jeux sociaux (GhostWord, DYP, etc.) permettant de créer et partager des presets et d&apos;interagir avec une communauté de joueurs.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">3. Âge minimum — 16 ans</h3>
        <p>L&apos;utilisation est <strong className="text-white">réservée aux 16 ans et plus</strong>. En créant un compte, vous déclarez avoir au moins 16 ans. Ce seuil est requis par le RGPD pour le consentement au traitement des données personnelles.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">4. Création de compte</h3>
        <p>Vous êtes responsable de la confidentialité de vos identifiants et de toute activité depuis votre compte. Vous vous engagez à fournir des informations exactes.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">5. Contenu utilisateur</h3>
        <p>En publiant du contenu, vous garantissez disposer des droits nécessaires et que le contenu est légal, non pornographique, non violent, non haineux. Tout contenu non conforme peut être supprimé sans préavis.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">6. Comportements interdits</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Utilisation à des fins illégales</li>
          <li>Harcèlement, menaces, intimidation</li>
          <li>Contournement des mesures de sécurité</li>
          <li>Robots ou scripts automatisés non autorisés</li>
          <li>Usurpation d&apos;identité</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">7. Propriété intellectuelle</h3>
        <p>Les éléments de la plateforme appartiennent à GameTrend. Le contenu utilisateur reste votre propriété, mais vous accordez à GameTrend une licence pour l&apos;afficher dans le cadre du service.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">8. Limitation de responsabilité</h3>
        <p>GameTrend est hébergeur de contenu (LCEN art. 6) et ne peut être tenu responsable des contenus publiés par les utilisateurs, sous réserve de les retirer promptement sur notification.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">9. Droit applicable</h3>
        <p>Droit français. Tribunal compétent : Tribunal Judiciaire de Chartres. Pour les utilisateurs UE : règles impératives de leur pays. International : arbitrage CCI.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">10. Contact</h3>
        <p><a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
      </section>
    </div>
  ),

  privacy: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <section><h3 className="text-white font-bold mb-1">1. Responsable du traitement</h3>
        <p>Quentin Filippini, micro-entrepreneur, SIRET 89181769400021, 1 rue de la Promenade, 28500 Aunay-sous-Crécy. <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
      </section>
      <section><h3 className="text-white font-bold mb-1">2. Données collectées</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Compte :</strong> email, pseudo, photo de profil, biographie</li>
          <li><strong className="text-white">Connexion :</strong> fournisseur OAuth, date/heure</li>
          <li><strong className="text-white">Contenu :</strong> presets créés, résultats de parties</li>
          <li><strong className="text-white">Social :</strong> liste d&apos;amis, notifications</li>
          <li><strong className="text-white">Technique :</strong> IP, navigateur, pages visitées (Google Analytics)</li>
          <li><strong className="text-white">Paiement (futur) :</strong> traité par prestataire PCI-DSS, jamais stocké chez nous</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">3. Base légale (RGPD)</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Exécution du contrat (art. 6.1.b) : fonctionnement du service</li>
          <li>Consentement (art. 6.1.a) : cookies analytiques et publicitaires</li>
          <li>Intérêt légitime (art. 6.1.f) : sécurité, modération</li>
          <li>Obligation légale (art. 6.1.c) : données comptables</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">4. Sous-traitants</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Supabase (BDD, auth, stockage) — UE</li>
          <li>Vercel (hébergement) — USA, garanties adéquates</li>
          <li>Resend (emails) — USA, garanties adéquates</li>
          <li>Google Analytics — avec votre consentement préalable</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">5. Vos droits (RGPD)</h3>
        <p>Accès, rectification, effacement, portabilité, opposition, limitation, retrait du consentement. Exerçables depuis votre Profil ou à <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a>. Réclamation possible auprès de la <a href="https://www.cnil.fr" className="text-brand-400">CNIL</a>.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">6. Conservation</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Données de compte : jusqu&apos;à suppression</li>
          <li>Logs techniques : 12 mois</li>
          <li>Données de paiement (futur) : 10 ans (obligation légale)</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">7. Sécurité</h3>
        <p>HTTPS/TLS, Row Level Security Supabase, chiffrement des mots de passe via Supabase Auth.</p>
      </section>
    </div>
  ),

  mentions: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <section><h3 className="text-white font-bold mb-1">Éditeur</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Nom :</strong> Quentin Filippini</li>
          <li><strong className="text-white">Statut :</strong> Micro-entrepreneur</li>
          <li><strong className="text-white">SIRET :</strong> 89181769400021</li>
          <li><strong className="text-white">Adresse :</strong> 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France</li>
          <li><strong className="text-white">Email :</strong> <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">Hébergement</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Frontend :</strong> Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, USA</li>
          <li><strong className="text-white">Base de données &amp; stockage :</strong> Supabase Inc., Singapour</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">Propriété intellectuelle</h3>
        <p>Design, code et textes sont la propriété de Quentin Filippini. Les contenus utilisateurs restent la propriété de leurs auteurs.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">Contenu utilisateur</h3>
        <p>GameTrend est hébergeur au sens de la LCEN (art. 6, loi 2004-575). Signalement : <a href="mailto:moderation@gametrend.fr" className="text-brand-400">moderation@gametrend.fr</a></p>
      </section>
    </div>
  ),

  cgv: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <section><h3 className="text-white font-bold mb-1">1. Offres d&apos;abonnement</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Mensuel :</strong> 4,99 € / mois</li>
          <li><strong className="text-white">Annuel :</strong> 49,99 € / an (~17 % d&apos;économie)</li>
        </ul>
        <p className="mt-2">Tarifs modifiables avec préavis de 30 jours. L&apos;abonnement se renouvelle automatiquement sauf résiliation préalable.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">2. Paiement</h3>
        <p>Traité par prestataire certifié PCI-DSS (Stripe ou équivalent). Aucune donnée bancaire stockée chez GameTrend.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">3. Droit de rétractation — 14 jours</h3>
        <p>Conformément à l&apos;art. L.221-18 du Code de la consommation, vous disposez de <strong className="text-white">14 jours calendaires</strong> pour vous rétracter sans justification. Remboursement sous 14 jours via le même moyen de paiement.</p>
        <p className="mt-1">Contact : <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
      </section>
      <section><h3 className="text-white font-bold mb-1">4. Résiliation</h3>
        <p>Résiliation à tout moment depuis Profil → Abonnement. Accès conservé jusqu&apos;à la fin de la période en cours, sans remboursement au prorata.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">5. Médiation</h3>
        <p>Plateforme européenne de résolution en ligne : <a href="https://ec.europa.eu/consumers/odr" className="text-brand-400">ec.europa.eu/consumers/odr</a></p>
      </section>
      <section><h3 className="text-white font-bold mb-1">6. Droit applicable</h3>
        <p>Droit français. Tribunal Judiciaire de Chartres.</p>
      </section>
    </div>
  ),
};

const CONTENT_EN: Record<LegalType, React.ReactNode> = {
  cgu: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <section><h3 className="text-white font-bold mb-1">1. Purpose</h3>
        <p>These Terms govern access to and use of <strong className="text-white">GameTrend</strong> (gametrend.fr), operated by Quentin Filippini, French sole proprietor (SIRET: 89181769400021).</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">2. Service description</h3>
        <p>Online social gaming platform (GhostWord, DYP, etc.) for creating and sharing presets and interacting with a community of players.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">3. Minimum age — 16</h3>
        <p>Use is <strong className="text-white">restricted to people aged 16 or older</strong>. By creating an account, you declare you are at least 16. This threshold matches the GDPR requirement for consent to personal-data processing.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">4. Account creation</h3>
        <p>You are responsible for keeping your credentials confidential and for any activity from your account. You must provide accurate information.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">5. User content</h3>
        <p>By publishing content, you warrant you hold the necessary rights and that the content is lawful, non-pornographic, non-violent and non-hateful. Non-compliant content may be removed without prior notice.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">6. Prohibited behaviour</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Using the platform for illegal purposes</li>
          <li>Harassment, threats, intimidation</li>
          <li>Bypassing security measures</li>
          <li>Unauthorised bots or automated scripts</li>
          <li>Impersonation</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">7. Intellectual property</h3>
        <p>Platform elements belong to GameTrend. Your content remains yours, but you grant GameTrend a licence to display it as part of operating the service.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">8. Limitation of liability</h3>
        <p>GameTrend is a content host (French LCEN art. 6) and is not liable for user-published content, provided it is removed promptly upon notification.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">9. Governing law</h3>
        <p>French law. Competent court: Tribunal Judiciaire de Chartres. EU users: mandatory rules of their country apply. International: ICC arbitration.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">10. Contact</h3>
        <p><a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
      </section>
    </div>
  ),

  privacy: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <section><h3 className="text-white font-bold mb-1">1. Data controller</h3>
        <p>Quentin Filippini, French sole proprietor, SIRET 89181769400021, 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France. <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
      </section>
      <section><h3 className="text-white font-bold mb-1">2. Data collected</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Account:</strong> email, username, profile picture, bio</li>
          <li><strong className="text-white">Sign-in:</strong> OAuth provider, date/time</li>
          <li><strong className="text-white">Content:</strong> presets created, match results</li>
          <li><strong className="text-white">Social:</strong> friends list, notifications</li>
          <li><strong className="text-white">Technical:</strong> IP, browser, pages visited (Google Analytics)</li>
          <li><strong className="text-white">Payment (future):</strong> handled by a PCI-DSS provider, never stored by us</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">3. Legal basis (GDPR)</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Performance of contract (art. 6.1.b): operating the service</li>
          <li>Consent (art. 6.1.a): analytics and advertising cookies</li>
          <li>Legitimate interest (art. 6.1.f): security, moderation</li>
          <li>Legal obligation (art. 6.1.c): accounting data</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">4. Processors</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Supabase (DB, auth, storage) — EU</li>
          <li>Vercel (hosting) — USA, with appropriate safeguards</li>
          <li>Resend (emails) — USA, with appropriate safeguards</li>
          <li>Google Analytics — subject to your prior consent</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">5. Your rights (GDPR)</h3>
        <p>Access, rectification, erasure, portability, objection, restriction, withdrawal of consent. Exercisable from your Profile or at <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a>. Complaints can be filed with the French <a href="https://www.cnil.fr" className="text-brand-400">CNIL</a> or your local supervisory authority.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">6. Retention</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Account data: until deletion</li>
          <li>Technical logs: 12 months</li>
          <li>Payment data (future): 10 years (legal accounting requirement)</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">7. Security</h3>
        <p>HTTPS/TLS, Supabase Row Level Security, password hashing via Supabase Auth.</p>
      </section>
    </div>
  ),

  mentions: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <section><h3 className="text-white font-bold mb-1">Publisher</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Name:</strong> Quentin Filippini</li>
          <li><strong className="text-white">Status:</strong> French sole proprietor (&ldquo;micro-entrepreneur&rdquo;)</li>
          <li><strong className="text-white">SIRET:</strong> 89181769400021</li>
          <li><strong className="text-white">Address:</strong> 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France</li>
          <li><strong className="text-white">Email:</strong> <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">Hosting</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Frontend:</strong> Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, USA</li>
          <li><strong className="text-white">Database &amp; storage:</strong> Supabase Inc., Singapore</li>
        </ul>
      </section>
      <section><h3 className="text-white font-bold mb-1">Intellectual property</h3>
        <p>Design, code and texts belong to Quentin Filippini. User content remains the property of its respective authors.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">User content</h3>
        <p>GameTrend is a content host within the meaning of the French LCEN (art. 6, law 2004-575). Reports: <a href="mailto:moderation@gametrend.fr" className="text-brand-400">moderation@gametrend.fr</a></p>
      </section>
    </div>
  ),

  cgv: (
    <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <section><h3 className="text-white font-bold mb-1">1. Subscription plans</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-white">Monthly:</strong> €4.99 / month</li>
          <li><strong className="text-white">Yearly:</strong> €49.99 / year (~17% saving)</li>
        </ul>
        <p className="mt-2">Prices may change with 30 days&apos; notice. The subscription renews automatically unless cancelled.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">2. Payment</h3>
        <p>Handled by a PCI-DSS-certified provider (Stripe or equivalent). No payment card data is stored by GameTrend.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">3. Right of withdrawal — 14 days</h3>
        <p>Under article L.221-18 of the French Consumer Code, you have <strong className="text-white">14 calendar days</strong> to withdraw without justification. Refund within 14 days using the same payment method.</p>
        <p className="mt-1">Contact: <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
      </section>
      <section><h3 className="text-white font-bold mb-1">4. Cancellation</h3>
        <p>Cancel any time from Profile → Subscription. Access kept until the end of the current period, no pro-rata refund.</p>
      </section>
      <section><h3 className="text-white font-bold mb-1">5. Mediation</h3>
        <p>European online dispute resolution platform: <a href="https://ec.europa.eu/consumers/odr" className="text-brand-400">ec.europa.eu/consumers/odr</a></p>
      </section>
      <section><h3 className="text-white font-bold mb-1">6. Governing law</h3>
        <p>French law. Tribunal Judiciaire de Chartres.</p>
      </section>
    </div>
  ),
};

interface LegalModalProps {
  type: LegalType;
  onClose: () => void;
}

export default function LegalModal({ type, onClose }: LegalModalProps) {
  const t = useTranslations("legal");
  const tc = useTranslations("common");
  const locale = useLocale();
  const labels: Record<LegalType, string> = {
    cgu: t("cgu"),
    cgv: t("cgv"),
    mentions: t("mentions"),
    privacy: t("privacy"),
  };
  const isEn = locale === "en";
  const body = (isEn ? CONTENT_EN : CONTENT_FR)[type];
  const title = labels[type];
  const noticeRaw = t("frenchOnlyNotice");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-surface-950 rounded-3xl border border-surface-700/30 overflow-hidden flex flex-col"
          style={{ maxHeight: "85vh", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800/60 shrink-0">
            <p className="text-white font-display font-bold text-sm">{title}</p>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-surface-500 hover:text-white hover:bg-surface-800 transition-all"
            >
              ✕
            </button>
          </div>

          {/* Contenu scrollable */}
          <div className="overflow-y-auto px-5 py-5 flex-1 space-y-3">
            {isEn && noticeRaw && (
              <p className="text-amber-400/80 text-xs italic border border-amber-700/30 bg-amber-950/20 rounded-lg px-3 py-2">
                {noticeRaw}
              </p>
            )}
            {body}
            <div className="pt-2">
              <Link
                href={`/legal/${type}`}
                onClick={onClose}
                className="text-brand-400 text-xs hover:text-brand-300"
              >
                {isEn ? "Open full version →" : "Voir la version complète →"}
              </Link>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-surface-800/60 shrink-0">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl font-display font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #6d28d9, #4f46e5)" }}
            >
              {tc("close")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
