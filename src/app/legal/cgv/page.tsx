export const metadata = { title: "CGV — GameTrend" };

export default function CGVPage() {
  return (
    <>
      <h1>Conditions Générales de Vente</h1>
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <hr />

      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales de Vente (CGV) régissent les relations contractuelles entre GameTrend (Quentin Filippini, micro-entrepreneur, SIRET 89181769400021) et tout utilisateur souscrivant à un abonnement payant sur la plateforme <strong>gametrend.fr</strong>.
      </p>

      <h2>2. Offres d'abonnement</h2>
      <p>GameTrend propose les formules d'abonnement suivantes (prix TTC) :</p>
      <ul>
        <li><strong>GameTrend Premium Mensuel :</strong> 4,99 € par mois</li>
        <li><strong>GameTrend Premium Annuel :</strong> 49,99 € par an (économie de ~17 % par rapport à l'abonnement mensuel)</li>
      </ul>
      <p>
        Ces tarifs peuvent être modifiés. Toute modification tarifaire sera notifiée aux abonnés existants au moins 30 jours avant son entrée en vigueur. Elle n'affecte pas les périodes d'abonnement en cours.
      </p>
      <p>
        La liste des fonctionnalités incluses dans chaque formule est disponible sur la page d'abonnement du site et peut évoluer au fil du temps.
      </p>

      <h2>3. Commande et paiement</h2>
      <p>
        La souscription à un abonnement s'effectue en ligne sur <strong>gametrend.fr</strong>. Le paiement est traité par un prestataire de paiement tiers sécurisé (Stripe ou équivalent certifié PCI-DSS). GameTrend ne stocke aucune donnée bancaire.
      </p>
      <p>
        Le contrat d'abonnement est conclu lors de la confirmation de paiement. Une confirmation par email est envoyée à l'adresse associée au compte.
      </p>
      <p>
        L'abonnement est renouvelé automatiquement à la fin de chaque période, sauf résiliation préalable.
      </p>

      <h2>4. Droit de rétractation</h2>
      <p>
        Conformément à l'article L.221-18 du Code de la consommation, <strong>vous disposez d'un délai de 14 jours calendaires</strong> à compter de la souscription pour exercer votre droit de rétractation, sans avoir à justifier de motifs ni à payer de pénalités.
      </p>
      <p>
        <strong>Exception :</strong> en vertu de l'article L.221-28, 13° du Code de la consommation, si vous avez expressément consenti à commencer l'exécution du service avant l'expiration du délai de rétractation et renoncé à votre droit de rétractation, aucun remboursement ne pourra être accordé pour les services déjà pleinement exécutés.
      </p>
      <p>
        Pour exercer votre droit de rétractation, contactez-nous à <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a> avec vos nom, email et date de souscription. Le remboursement sera effectué dans les 14 jours suivant la réception de votre demande, par le même moyen de paiement que celui utilisé lors de la souscription.
      </p>

      <h2>5. Résiliation</h2>
      <p>
        Vous pouvez résilier votre abonnement à tout moment depuis votre espace personnel (page Profil → Abonnement). La résiliation prend effet à la fin de la période d'abonnement en cours — vous conservez l'accès aux fonctionnalités premium jusqu'à cette date, sans remboursement au prorata.
      </p>
      <p>
        GameTrend se réserve le droit de résilier un abonnement en cas de violation des CGU, sans remboursement.
      </p>

      <h2>6. Médiation</h2>
      <p>
        En cas de litige non résolu amiablement, vous pouvez recourir gratuitement à un médiateur de la consommation. Pour les consommateurs européens, la plateforme de résolution en ligne des litiges de la Commission européenne est accessible à l'adresse : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>.
      </p>

      <h2>7. Droit applicable</h2>
      <p>
        Les présentes CGV sont soumises au droit français. En cas de litige, les tribunaux compétents seront ceux du ressort du Tribunal Judiciaire de Chartres, sous réserve des dispositions impératives protectrices des consommateurs dans leur pays de résidence.
      </p>

      <h2>8. Contact</h2>
      <p>
        Pour toute question relative à votre abonnement : <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}
