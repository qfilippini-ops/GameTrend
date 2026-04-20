import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const t = await getTranslations("legal");
  return { title: `${t("cgu")} — GameTrend` };
}

export default async function CGUPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en" ? <CGUEnglish /> : <CGUFrench />;
}

function CGUFrench() {
  return (
    <>
      <h1>Conditions Générales d&apos;Utilisation</h1>
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <hr />

      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») régissent l&apos;accès et l&apos;utilisation de la plateforme <strong>GameTrend</strong>, accessible à l&apos;adresse <strong>gametrend.fr</strong>, éditée par Quentin Filippini, micro-entrepreneur (SIRET : 89181769400021).
      </p>
      <p>
        En accédant à GameTrend, vous acceptez sans réserve les présentes CGU. Si vous n&apos;acceptez pas ces conditions, vous devez cesser d&apos;utiliser la plateforme.
      </p>

      <h2>2. Description du service</h2>
      <p>
        GameTrend est une plateforme de jeux sociaux en ligne permettant aux utilisateurs de jouer à des jeux de soirée (GhostWord, DYP, etc.), de créer et partager des « presets » (configurations de jeux personnalisées incluant des mots, images et paramètres), et d&apos;interagir avec une communauté de joueurs.
      </p>

      <h2>3. Conditions d&apos;accès — Âge minimum</h2>
      <p>
        L&apos;utilisation de GameTrend est <strong>réservée aux personnes âgées de 16 ans ou plus</strong>. En créant un compte, vous déclarez avoir au moins 16 ans. GameTrend se réserve le droit de suspendre tout compte dont le titulaire serait mineur de moins de 16 ans.
      </p>
      <p>
        Conformément au Règlement Général sur la Protection des Données (RGPD), le seuil de 16 ans est retenu pour le consentement au traitement des données personnelles dans le cadre des services de la société de l&apos;information.
      </p>

      <h2>4. Création de compte</h2>
      <p>
        L&apos;accès à certaines fonctionnalités (création de presets, mode multijoueur en ligne, système social) nécessite la création d&apos;un compte. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité réalisée depuis votre compte.
      </p>
      <p>
        Vous vous engagez à fournir des informations exactes lors de la création de votre compte et à les maintenir à jour.
      </p>

      <h2>5. Contenu utilisateur</h2>
      <p>
        GameTrend permet aux utilisateurs de publier du contenu (presets, images, pseudonymes). En publiant du contenu, vous garantissez que :
      </p>
      <ul>
        <li>Vous disposez des droits nécessaires sur ce contenu</li>
        <li>Le contenu ne contient pas d&apos;éléments pornographiques, violents, haineux, discriminatoires ou illicites</li>
        <li>Le contenu est exclusivement destiné à un public tout public (16+)</li>
        <li>Le contenu ne viole pas les droits de tiers (propriété intellectuelle, vie privée, etc.)</li>
      </ul>
      <p>
        GameTrend dispose d&apos;un système de détection automatique et de modération humaine. Tout contenu non conforme peut être supprimé sans préavis.
      </p>

      <h2>6. Comportement interdit</h2>
      <p>Il est strictement interdit de :</p>
      <ul>
        <li>Utiliser la plateforme à des fins illégales</li>
        <li>Harceler, menacer ou intimider d&apos;autres utilisateurs</li>
        <li>Publier des contenus portant atteinte à la dignité humaine</li>
        <li>Tenter de contourner les mesures de sécurité de la plateforme</li>
        <li>Utiliser des robots ou scripts automatisés sans autorisation écrite</li>
        <li>Usurper l&apos;identité d&apos;un autre utilisateur ou de GameTrend</li>
      </ul>

      <h2>7. Propriété intellectuelle</h2>
      <p>
        Les éléments de la plateforme (design, code, marque) appartiennent à GameTrend. Le contenu publié par les utilisateurs reste leur propriété, mais en le publiant ils accordent à GameTrend une licence mondiale, non exclusive, gratuite pour afficher, reproduire et distribuer ce contenu dans le cadre du fonctionnement du service.
      </p>

      <h2>8. Disponibilité et modifications</h2>
      <p>
        GameTrend s&apos;efforce d&apos;assurer la disponibilité du service 24h/24, 7j/7, mais ne saurait être tenu responsable en cas d&apos;interruption. GameTrend se réserve le droit de modifier, suspendre ou interrompre tout ou partie du service, et de modifier les présentes CGU à tout moment. Les utilisateurs seront informés des modifications significatives.
      </p>

      <h2>9. Résiliation</h2>
      <p>
        GameTrend se réserve le droit de suspendre ou supprimer tout compte en cas de violation des présentes CGU, sans préavis ni indemnité. L&apos;utilisateur peut également supprimer son compte à tout moment depuis la page Profil.
      </p>

      <h2>10. Limitation de responsabilité</h2>
      <p>
        GameTrend est une plateforme d&apos;hébergement de contenu. Sa responsabilité ne saurait être engagée du fait des contenus publiés par les utilisateurs, sous réserve de les retirer promptement dès notification d&apos;illicéité.
      </p>
      <p>
        GameTrend ne peut être tenu responsable des dommages indirects résultant de l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser la plateforme.
      </p>

      <h2>11. Droit applicable et juridiction</h2>
      <p>
        Les présentes CGU sont régies par le droit français. En cas de litige non résolu amiablement, les tribunaux compétents seront ceux du ressort du Tribunal Judiciaire de Chartres (France), sans préjudice des règles impératives applicables dans le pays de résidence de l&apos;utilisateur, notamment pour les utilisateurs résidant dans l&apos;Union Européenne.
      </p>
      <p>
        Pour les utilisateurs résidant hors de l&apos;Union Européenne, les litiges pourront être soumis à une procédure d&apos;arbitrage internationale conformément aux règles de la Chambre de Commerce Internationale (CCI).
      </p>

      <h2>12. Contact</h2>
      <p>
        Pour toute question relative aux présentes CGU : <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}

function CGUEnglish() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <hr />

      <h2>1. Purpose</h2>
      <p>
        These Terms of Service (hereinafter the &ldquo;Terms&rdquo;) govern access to and use of the <strong>GameTrend</strong> platform, available at <strong>gametrend.fr</strong>, operated by Quentin Filippini, sole proprietor (French registration SIRET: 89181769400021).
      </p>
      <p>
        By accessing GameTrend, you accept these Terms in full. If you do not accept them, you must stop using the platform.
      </p>

      <h2>2. Service description</h2>
      <p>
        GameTrend is an online social gaming platform that allows users to play party games (GhostWord, DYP, etc.), to create and share &ldquo;presets&rdquo; (custom game configurations including words, images and settings), and to interact with a community of players.
      </p>

      <h2>3. Eligibility — Minimum age</h2>
      <p>
        Use of GameTrend is <strong>restricted to people aged 16 or older</strong>. By creating an account, you declare that you are at least 16 years old. GameTrend reserves the right to suspend any account whose holder is under 16.
      </p>
      <p>
        In line with the General Data Protection Regulation (GDPR), 16 is the threshold used for consent to the processing of personal data in the context of information society services.
      </p>

      <h2>4. Account creation</h2>
      <p>
        Access to certain features (preset creation, online multiplayer, social features) requires creating an account. You are responsible for keeping your credentials confidential and for any activity carried out from your account.
      </p>
      <p>
        You agree to provide accurate information when creating your account and to keep it up to date.
      </p>

      <h2>5. User content</h2>
      <p>
        GameTrend allows users to publish content (presets, images, usernames). By publishing content, you warrant that:
      </p>
      <ul>
        <li>You hold the necessary rights to that content;</li>
        <li>The content does not contain pornographic, violent, hateful, discriminatory or unlawful elements;</li>
        <li>The content is suitable for a general audience (16+);</li>
        <li>The content does not infringe the rights of third parties (intellectual property, privacy, etc.).</li>
      </ul>
      <p>
        GameTrend uses both automated detection and human moderation. Any non-compliant content may be removed without prior notice.
      </p>

      <h2>6. Prohibited behaviour</h2>
      <p>The following are strictly prohibited:</p>
      <ul>
        <li>Using the platform for illegal purposes;</li>
        <li>Harassing, threatening or intimidating other users;</li>
        <li>Publishing content that undermines human dignity;</li>
        <li>Attempting to bypass the platform&apos;s security measures;</li>
        <li>Using bots or automated scripts without prior written permission;</li>
        <li>Impersonating another user or GameTrend itself.</li>
      </ul>

      <h2>7. Intellectual property</h2>
      <p>
        Platform elements (design, code, brand) belong to GameTrend. Content published by users remains their property, but by publishing it they grant GameTrend a worldwide, non-exclusive, royalty-free licence to display, reproduce and distribute such content as part of operating the service.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        GameTrend strives to keep the service available 24/7 but cannot be held liable for any interruption. GameTrend reserves the right to change, suspend or discontinue all or part of the service, and to amend these Terms at any time. Users will be informed of significant changes.
      </p>

      <h2>9. Termination</h2>
      <p>
        GameTrend reserves the right to suspend or delete any account in case of breach of these Terms, without prior notice or compensation. Users may also delete their account at any time from the Profile page.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        GameTrend is a content-hosting platform. It cannot be held liable for content published by users, provided it removes such content promptly upon notification that it is unlawful.
      </p>
      <p>
        GameTrend cannot be held liable for indirect damages arising from the use of, or inability to use, the platform.
      </p>

      <h2>11. Governing law and jurisdiction</h2>
      <p>
        These Terms are governed by French law. In the event of a dispute that cannot be resolved amicably, the competent courts shall be those within the jurisdiction of the Tribunal Judiciaire de Chartres (France), without prejudice to mandatory rules applicable in the user&apos;s country of residence, in particular for users residing in the European Union.
      </p>
      <p>
        For users residing outside the European Union, disputes may be submitted to international arbitration under the rules of the International Chamber of Commerce (ICC).
      </p>

      <h2>12. Contact</h2>
      <p>
        For any question regarding these Terms: <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}
