"use client";

import { motion, AnimatePresence } from "framer-motion";

export type LegalType = "cgu" | "privacy" | "mentions" | "cgv";

const CONTENT: Record<LegalType, { title: string; body: React.ReactNode }> = {
  cgu: {
    title: "Conditions Générales d'Utilisation",
    body: (
      <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
        <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
        <section><h3 className="text-white font-bold mb-1">1. Objet</h3>
          <p>Les présentes CGU régissent l'accès et l'utilisation de <strong className="text-white">GameTrend</strong> (gametrend.fr), édité par Quentin Filippini, micro-entrepreneur (SIRET : 89181769400021).</p>
        </section>
        <section><h3 className="text-white font-bold mb-1">2. Description du service</h3>
          <p>Plateforme de jeux sociaux (GhostWord, DYP, etc.) permettant de créer et partager des presets et d'interagir avec une communauté de joueurs.</p>
        </section>
        <section><h3 className="text-white font-bold mb-1">3. Âge minimum — 16 ans</h3>
          <p>L'utilisation est <strong className="text-white">réservée aux 16 ans et plus</strong>. En créant un compte, vous déclarez avoir au moins 16 ans. Ce seuil est requis par le RGPD pour le consentement au traitement des données personnelles.</p>
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
            <li>Usurpation d'identité</li>
          </ul>
        </section>
        <section><h3 className="text-white font-bold mb-1">7. Propriété intellectuelle</h3>
          <p>Les éléments de la plateforme appartiennent à GameTrend. Le contenu utilisateur reste votre propriété, mais vous accordez à GameTrend une licence pour l'afficher dans le cadre du service.</p>
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
  },

  privacy: {
    title: "Politique de confidentialité",
    body: (
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
            <li><strong className="text-white">Social :</strong> liste d'amis, notifications</li>
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
          <p>Accès, rectification, effacement, portabilité, opposition, limitation, retrait du consentement. Exercisables depuis votre Profil ou à <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a>. Réclamation possible auprès de la <a href="https://www.cnil.fr" className="text-brand-400">CNIL</a>.</p>
        </section>
        <section><h3 className="text-white font-bold mb-1">6. Conservation</h3>
          <ul className="list-disc pl-4 space-y-1">
            <li>Données de compte : jusqu'à suppression</li>
            <li>Logs techniques : 12 mois</li>
            <li>Données de paiement (futur) : 10 ans (obligation légale)</li>
          </ul>
        </section>
        <section><h3 className="text-white font-bold mb-1">7. Sécurité</h3>
          <p>HTTPS/TLS, Row Level Security Supabase, chiffrement des mots de passe via Supabase Auth.</p>
        </section>
      </div>
    ),
  },

  mentions: {
    title: "Mentions légales",
    body: (
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
            <li><strong className="text-white">Base de données & stockage :</strong> Supabase Inc., Singapour</li>
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
  },

  cgv: {
    title: "Conditions Générales de Vente",
    body: (
      <div className="space-y-4 text-sm text-surface-300 leading-relaxed">
        <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
        <section><h3 className="text-white font-bold mb-1">1. Offres d'abonnement</h3>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong className="text-white">Mensuel :</strong> 4,99 € / mois</li>
            <li><strong className="text-white">Annuel :</strong> 49,99 € / an (~17 % d'économie)</li>
          </ul>
          <p className="mt-2">Tarifs modifiables avec préavis de 30 jours. L'abonnement se renouvelle automatiquement sauf résiliation préalable.</p>
        </section>
        <section><h3 className="text-white font-bold mb-1">2. Paiement</h3>
          <p>Traité par prestataire certifié PCI-DSS (Stripe ou équivalent). Aucune donnée bancaire stockée chez GameTrend.</p>
        </section>
        <section><h3 className="text-white font-bold mb-1">3. Droit de rétractation — 14 jours</h3>
          <p>Conformément à l'art. L.221-18 du Code de la consommation, vous disposez de <strong className="text-white">14 jours calendaires</strong> pour vous rétracter sans justification. Remboursement sous 14 jours via le même moyen de paiement.</p>
          <p className="mt-1">Contact : <a href="mailto:contact@gametrend.fr" className="text-brand-400">contact@gametrend.fr</a></p>
        </section>
        <section><h3 className="text-white font-bold mb-1">4. Résiliation</h3>
          <p>Résiliation à tout moment depuis Profil → Abonnement. Accès conservé jusqu'à la fin de la période en cours, sans remboursement au prorata.</p>
        </section>
        <section><h3 className="text-white font-bold mb-1">5. Médiation</h3>
          <p>Plateforme européenne de résolution en ligne : <a href="https://ec.europa.eu/consumers/odr" className="text-brand-400">ec.europa.eu/consumers/odr</a></p>
        </section>
        <section><h3 className="text-white font-bold mb-1">6. Droit applicable</h3>
          <p>Droit français. Tribunal Judiciaire de Chartres.</p>
        </section>
      </div>
    ),
  },
};

interface LegalModalProps {
  type: LegalType;
  onClose: () => void;
}

export default function LegalModal({ type, onClose }: LegalModalProps) {
  const { title, body } = CONTENT[type];

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
          <div className="overflow-y-auto px-5 py-5 flex-1">
            {body}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-surface-800/60 shrink-0">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl font-display font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #6d28d9, #4f46e5)" }}
            >
              Fermer
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
