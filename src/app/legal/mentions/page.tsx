export const metadata = { title: "Mentions légales — GameTrend" };

export default function MentionsLegalesPage() {
  return (
    <>
      <h1>Mentions légales</h1>
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <hr />

      <h2>Éditeur du site</h2>
      <p>
        Le site <strong>GameTrend</strong> (accessible à l'adresse <strong>gametrend.fr</strong>) est édité par :
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
        <li><strong>Base de données & stockage :</strong> Supabase Inc., 970 Toa Payoh North, #07-04, Singapour 318992 — <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a></li>
      </ul>

      <h2>Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments constituant le site GameTrend (design, code source, textes, logos) est la propriété exclusive de Quentin Filippini, à l'exception des contenus générés par les utilisateurs (presets, images) qui restent la propriété de leurs auteurs respectifs.
      </p>
      <p>
        Toute reproduction, représentation, modification ou exploitation non autorisée du site ou de son contenu est strictement interdite.
      </p>

      <h2>Contenu utilisateur</h2>
      <p>
        GameTrend est une plateforme d'hébergement de contenu au sens de l'article 6 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN). À ce titre, GameTrend n'est pas responsable des contenus publiés par les utilisateurs, mais s'engage à retirer promptement tout contenu illicite dès sa notification via le système de signalement disponible sur le site.
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
