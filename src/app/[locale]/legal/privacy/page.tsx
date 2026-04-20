import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const t = await getTranslations("legal");
  return { title: `${t("privacy")} — GameTrend` };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en" ? <PrivacyEnglish /> : <PrivacyFrench />;
}

function PrivacyFrench() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <hr />

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement des données personnelles collectées sur <strong>gametrend.fr</strong> est Quentin Filippini, micro-entrepreneur, SIRET 89181769400021, 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France. Contact : <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>

      <h2>2. Données collectées</h2>
      <p>GameTrend collecte les données suivantes :</p>
      <ul>
        <li><strong>Données de compte :</strong> adresse email, nom d&apos;utilisateur (pseudo), photo de profil, biographie (optionnelle)</li>
        <li><strong>Données de connexion :</strong> fournisseur OAuth (Google si utilisé), date et heure de connexion</li>
        <li><strong>Contenu utilisateur :</strong> presets créés (noms, images, configurations), résultats de parties</li>
        <li><strong>Données sociales :</strong> liste d&apos;amis, notifications reçues</li>
        <li><strong>Données techniques :</strong> adresse IP, type de navigateur, pages visitées (via Google Analytics)</li>
        <li><strong>Données de paiement (futur) :</strong> en cas d&apos;abonnement, les données de paiement seront traitées par un prestataire tiers certifié PCI-DSS et ne seront jamais stockées sur nos serveurs</li>
      </ul>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li>Création et gestion des comptes utilisateurs</li>
        <li>Fourniture du service de jeux et de création de presets</li>
        <li>Fonctionnement du système social (amis, notifications)</li>
        <li>Amélioration de la plateforme via des statistiques d&apos;utilisation anonymisées (Google Analytics)</li>
        <li>Modération du contenu et sécurité de la plateforme</li>
        <li>Gestion des abonnements et paiements (futur)</li>
        <li>Envoi d&apos;emails transactionnels (confirmation de compte, réinitialisation de mot de passe)</li>
        <li>Diffusion de publicités contextuelles ou ciblées avec votre consentement (futur)</li>
      </ul>

      <h2>4. Base légale</h2>
      <ul>
        <li><strong>Exécution du contrat</strong> (art. 6.1.b RGPD) : données nécessaires au fonctionnement du service</li>
        <li><strong>Consentement</strong> (art. 6.1.a RGPD) : cookies analytiques, publicités ciblées</li>
        <li><strong>Intérêt légitime</strong> (art. 6.1.f RGPD) : sécurité, lutte contre la fraude et la modération</li>
        <li><strong>Obligation légale</strong> (art. 6.1.c RGPD) : conservation de certaines données à des fins comptables et légales</li>
      </ul>

      <h2>5. Sous-traitants et transferts</h2>
      <p>GameTrend fait appel aux sous-traitants suivants :</p>
      <ul>
        <li><strong>Supabase</strong> (base de données, authentification, stockage) — Union Européenne (région EU West)</li>
        <li><strong>Vercel</strong> (hébergement) — États-Unis (avec garanties adéquates via clauses contractuelles types)</li>
        <li><strong>Resend</strong> (emails transactionnels) — États-Unis (avec garanties adéquates)</li>
        <li><strong>Google Analytics</strong> (statistiques) — États-Unis — soumis à votre consentement préalable</li>
        <li><strong>Régie publicitaire (futur)</strong> — soumis à votre consentement préalable</li>
      </ul>

      <h2>6. Durée de conservation</h2>
      <ul>
        <li>Données de compte : jusqu&apos;à suppression du compte par l&apos;utilisateur</li>
        <li>Contenu utilisateur : jusqu&apos;à suppression du contenu ou du compte</li>
        <li>Logs techniques : 12 mois maximum</li>
        <li>Données de paiement (futur) : 10 ans (obligation comptable légale)</li>
      </ul>

      <h2>7. Vos droits (RGPD)</h2>
      <p>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;accès</strong> : obtenir une copie de vos données personnelles</li>
        <li><strong>Droit de rectification</strong> : corriger vos données via la page Profil</li>
        <li><strong>Droit à l&apos;effacement</strong> : supprimer votre compte et toutes vos données</li>
        <li><strong>Droit à la portabilité</strong> : exporter vos données au format JSON</li>
        <li><strong>Droit d&apos;opposition</strong> : vous opposer au traitement pour motif légitime</li>
        <li><strong>Droit à la limitation</strong> : demander la suspension du traitement</li>
        <li><strong>Retrait du consentement</strong> : retirer votre consentement aux cookies à tout moment</li>
      </ul>
      <p>
        Ces droits sont exerçables depuis votre page Profil ou en contactant <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>. En cas de réclamation non résolue, vous pouvez saisir la <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
      </p>

      <h2>8. Cookies</h2>
      <p>GameTrend utilise les types de cookies suivants :</p>
      <ul>
        <li><strong>Cookies essentiels</strong> (sans consentement) : session d&apos;authentification, préférences de consentement</li>
        <li><strong>Cookies analytiques</strong> (avec consentement) : Google Analytics pour comprendre l&apos;utilisation du service. Ces cookies sont désactivés par défaut jusqu&apos;à votre acceptation.</li>
        <li><strong>Cookies publicitaires (futur, avec consentement)</strong> : permettront la diffusion de publicités personnalisées si vous y consentez.</li>
      </ul>
      <p>Vous pouvez gérer vos préférences cookies à tout moment via la bannière de consentement.</p>

      <h2>9. Sécurité</h2>
      <p>
        GameTrend met en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données : chiffrement des communications (HTTPS/TLS), accès aux données restreint par des règles de sécurité au niveau base de données (Row Level Security), chiffrement des mots de passe (via Supabase Auth).
      </p>

      <h2>10. Contact DPO</h2>
      <p>
        Pour toute question relative à la protection de vos données : <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}

function PrivacyEnglish() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <hr />

      <h2>1. Data controller</h2>
      <p>
        The controller for personal data collected on <strong>gametrend.fr</strong> is Quentin Filippini, French sole proprietor, SIRET 89181769400021, 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France. Contact: <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>

      <h2>2. Data collected</h2>
      <p>GameTrend collects the following data:</p>
      <ul>
        <li><strong>Account data:</strong> email address, username, profile picture, biography (optional)</li>
        <li><strong>Sign-in data:</strong> OAuth provider (Google, if used), date and time of connection</li>
        <li><strong>User content:</strong> presets created (names, images, configurations), match results</li>
        <li><strong>Social data:</strong> friends list, notifications received</li>
        <li><strong>Technical data:</strong> IP address, browser type, pages visited (via Google Analytics)</li>
        <li><strong>Payment data (future):</strong> for paid subscriptions, payment data will be processed by a PCI-DSS-certified third-party provider and never stored on our servers</li>
      </ul>

      <h2>3. Purposes of processing</h2>
      <ul>
        <li>Creation and management of user accounts</li>
        <li>Provision of the gaming and preset-creation service</li>
        <li>Operation of the social system (friends, notifications)</li>
        <li>Improving the platform through anonymised usage statistics (Google Analytics)</li>
        <li>Content moderation and platform security</li>
        <li>Subscription and payment management (future)</li>
        <li>Sending transactional emails (account confirmation, password reset)</li>
        <li>Serving contextual or targeted advertising with your consent (future)</li>
      </ul>

      <h2>4. Legal basis</h2>
      <ul>
        <li><strong>Performance of the contract</strong> (art. 6.1.b GDPR): data necessary to operate the service</li>
        <li><strong>Consent</strong> (art. 6.1.a GDPR): analytics cookies, targeted advertising</li>
        <li><strong>Legitimate interest</strong> (art. 6.1.f GDPR): security, fraud prevention and moderation</li>
        <li><strong>Legal obligation</strong> (art. 6.1.c GDPR): retention of certain data for accounting and legal purposes</li>
      </ul>

      <h2>5. Processors and transfers</h2>
      <p>GameTrend uses the following processors:</p>
      <ul>
        <li><strong>Supabase</strong> (database, authentication, storage) — European Union (EU West region)</li>
        <li><strong>Vercel</strong> (hosting) — United States (with appropriate safeguards via Standard Contractual Clauses)</li>
        <li><strong>Resend</strong> (transactional emails) — United States (with appropriate safeguards)</li>
        <li><strong>Google Analytics</strong> (statistics) — United States — subject to your prior consent</li>
        <li><strong>Advertising provider (future)</strong> — subject to your prior consent</li>
      </ul>

      <h2>6. Retention period</h2>
      <ul>
        <li>Account data: until the user deletes the account</li>
        <li>User content: until the content or account is deleted</li>
        <li>Technical logs: 12 months maximum</li>
        <li>Payment data (future): 10 years (legal accounting requirement)</li>
      </ul>

      <h2>7. Your rights (GDPR)</h2>
      <p>Under the GDPR, you have the following rights:</p>
      <ul>
        <li><strong>Right of access:</strong> obtain a copy of your personal data</li>
        <li><strong>Right of rectification:</strong> correct your data via the Profile page</li>
        <li><strong>Right of erasure:</strong> delete your account and all associated data</li>
        <li><strong>Right to portability:</strong> export your data in JSON format</li>
        <li><strong>Right to object:</strong> object to processing on legitimate grounds</li>
        <li><strong>Right to restriction:</strong> request the suspension of processing</li>
        <li><strong>Withdrawal of consent:</strong> withdraw your cookie consent at any time</li>
      </ul>
      <p>
        These rights can be exercised from your Profile page or by contacting <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>. In case of an unresolved complaint, you may lodge a complaint with the French data protection authority, the <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>), or with your local supervisory authority within the EU.
      </p>

      <h2>8. Cookies</h2>
      <p>GameTrend uses the following types of cookies:</p>
      <ul>
        <li><strong>Essential cookies</strong> (no consent required): authentication session, consent preferences</li>
        <li><strong>Analytics cookies</strong> (with consent): Google Analytics to understand service usage. These cookies are disabled by default until you accept them.</li>
        <li><strong>Advertising cookies (future, with consent):</strong> will be used to serve personalised advertising if you consent.</li>
      </ul>
      <p>You can manage your cookie preferences at any time via the consent banner.</p>

      <h2>9. Security</h2>
      <p>
        GameTrend implements appropriate technical and organisational measures to protect your data: encryption of communications (HTTPS/TLS), restricted data access through database-level security rules (Row Level Security), and encrypted password storage (via Supabase Auth).
      </p>

      <h2>10. Contact (data protection)</h2>
      <p>
        For any question regarding the protection of your data: <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}
