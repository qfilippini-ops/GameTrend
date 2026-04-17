export const metadata = { title: "Politique de confidentialité — GameTrend" };

export default function PrivacyPage() {
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
        <li><strong>Données de compte :</strong> adresse email, nom d'utilisateur (pseudo), photo de profil, biographie (optionnelle)</li>
        <li><strong>Données de connexion :</strong> fournisseur OAuth (Google si utilisé), date et heure de connexion</li>
        <li><strong>Contenu utilisateur :</strong> presets créés (noms, images, configurations), résultats de parties</li>
        <li><strong>Données sociales :</strong> liste d'amis, notifications reçues</li>
        <li><strong>Données techniques :</strong> adresse IP, type de navigateur, pages visitées (via Google Analytics)</li>
        <li><strong>Données de paiement (futur) :</strong> en cas d'abonnement, les données de paiement seront traitées par un prestataire tiers certifié PCI-DSS et ne seront jamais stockées sur nos serveurs</li>
      </ul>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li>Création et gestion des comptes utilisateurs</li>
        <li>Fourniture du service de jeux et de création de presets</li>
        <li>Fonctionnement du système social (amis, notifications)</li>
        <li>Amélioration de la plateforme via des statistiques d'utilisation anonymisées (Google Analytics)</li>
        <li>Modération du contenu et sécurité de la plateforme</li>
        <li>Gestion des abonnements et paiements (futur)</li>
        <li>Envoi d'emails transactionnels (confirmation de compte, réinitialisation de mot de passe)</li>
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
        <li>Données de compte : jusqu'à suppression du compte par l'utilisateur</li>
        <li>Contenu utilisateur : jusqu'à suppression du contenu ou du compte</li>
        <li>Logs techniques : 12 mois maximum</li>
        <li>Données de paiement (futur) : 10 ans (obligation comptable légale)</li>
      </ul>

      <h2>7. Vos droits (RGPD)</h2>
      <p>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d'accès</strong> : obtenir une copie de vos données personnelles</li>
        <li><strong>Droit de rectification</strong> : corriger vos données via la page Profil</li>
        <li><strong>Droit à l'effacement</strong> : supprimer votre compte et toutes vos données</li>
        <li><strong>Droit à la portabilité</strong> : exporter vos données au format JSON</li>
        <li><strong>Droit d'opposition</strong> : vous opposer au traitement pour motif légitime</li>
        <li><strong>Droit à la limitation</strong> : demander la suspension du traitement</li>
        <li><strong>Retrait du consentement</strong> : retirer votre consentement aux cookies à tout moment</li>
      </ul>
      <p>
        Ces droits sont exercisables depuis votre page Profil ou en contactant <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>. En cas de réclamation non résolue, vous pouvez saisir la <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
      </p>

      <h2>8. Cookies</h2>
      <p>GameTrend utilise les types de cookies suivants :</p>
      <ul>
        <li><strong>Cookies essentiels</strong> (sans consentement) : session d'authentification, préférences de consentement</li>
        <li><strong>Cookies analytiques</strong> (avec consentement) : Google Analytics pour comprendre l'utilisation du service. Ces cookies sont désactivés par défaut jusqu'à votre acceptation.</li>
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
