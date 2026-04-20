import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const t = await getTranslations("legal");
  return { title: `${t("mentions")} — GameTrend` };
}

export default async function MentionsLegalesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en" ? <MentionsEnglish /> : <MentionsFrench />;
}

function MentionsFrench() {
  return (
    <>
      <h1>Mentions légales</h1>
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <hr />

      <h2>Éditeur du site</h2>
      <p>
        Le site <strong>GameTrend</strong> (accessible à l&apos;adresse <strong>gametrend.fr</strong>) est édité par :
      </p>
      <ul>
        <li><strong>Nom :</strong> Quentin Filippini</li>
        <li><strong>Statut :</strong> Micro-entrepreneur</li>
        <li><strong>SIRET :</strong> 89181769400021</li>
        <li><strong>Adresse :</strong> 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France</li>
        <li><strong>Email :</strong> <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a></li>
      </ul>

      <h2>Hébergement</h2>
      <ul>
        <li><strong>Hébergeur frontend :</strong> Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, États-Unis — <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a></li>
        <li><strong>Base de données &amp; stockage :</strong> Supabase Inc., 970 Toa Payoh North, #07-04, Singapour 318992 — <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a></li>
      </ul>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des éléments constituant le site GameTrend (design, code source, textes, logos) est la propriété exclusive de Quentin Filippini, à l&apos;exception des contenus générés par les utilisateurs (presets, images) qui restent la propriété de leurs auteurs respectifs.
      </p>
      <p>
        Toute reproduction, représentation, modification ou exploitation non autorisée du site ou de son contenu est strictement interdite.
      </p>

      <h2>Contenu utilisateur</h2>
      <p>
        GameTrend est une plateforme d&apos;hébergement de contenu au sens de l&apos;article 6 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans l&apos;économie numérique (LCEN). À ce titre, GameTrend n&apos;est pas responsable des contenus publiés par les utilisateurs, mais s&apos;engage à retirer promptement tout contenu illicite dès sa notification via le système de signalement disponible sur le site.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question juridique ou signalement urgent : <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
      <p>
        Pour les signalements de contenu inapproprié : <a href="mailto:moderation@gametrend.fr">moderation@gametrend.fr</a>
      </p>
    </>
  );
}

function MentionsEnglish() {
  return (
    <>
      <h1>Legal Notice</h1>
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <hr />

      <h2>Site publisher</h2>
      <p>
        The website <strong>GameTrend</strong> (available at <strong>gametrend.fr</strong>) is published by:
      </p>
      <ul>
        <li><strong>Name:</strong> Quentin Filippini</li>
        <li><strong>Status:</strong> French sole proprietor (&ldquo;micro-entrepreneur&rdquo;)</li>
        <li><strong>SIRET:</strong> 89181769400021</li>
        <li><strong>Address:</strong> 1 rue de la Promenade, 28500 Aunay-sous-Crécy, France</li>
        <li><strong>Email:</strong> <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a></li>
      </ul>

      <h2>Hosting</h2>
      <ul>
        <li><strong>Frontend host:</strong> Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, United States — <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a></li>
        <li><strong>Database &amp; storage:</strong> Supabase Inc., 970 Toa Payoh North, #07-04, Singapore 318992 — <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a></li>
      </ul>

      <h2>Intellectual property</h2>
      <p>
        All elements making up the GameTrend website (design, source code, texts, logos) are the exclusive property of Quentin Filippini, except for user-generated content (presets, images) which remains the property of their respective authors.
      </p>
      <p>
        Any unauthorised reproduction, representation, modification or exploitation of the site or its content is strictly prohibited.
      </p>

      <h2>User content</h2>
      <p>
        GameTrend is a content-hosting platform within the meaning of article 6 of French law no. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN). As such, GameTrend is not liable for content published by users, but undertakes to promptly remove any unlawful content upon notification through the reporting system available on the site.
      </p>

      <h2>Contact</h2>
      <p>
        For any legal question or urgent report: <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
      <p>
        To report inappropriate content: <a href="mailto:moderation@gametrend.fr">moderation@gametrend.fr</a>
      </p>
    </>
  );
}
