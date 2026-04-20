import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const t = await getTranslations("legal");
  return { title: `${t("cgv")} — GameTrend` };
}

export default async function CGVPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en" ? <CGVEnglish /> : <CGVFrench />;
}

function CGVFrench() {
  return (
    <>
      <h1>Conditions Générales de Vente</h1>
      <p className="text-surface-500 text-xs">Dernière mise à jour : avril 2025</p>
      <hr />

      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales de Vente (CGV) régissent les relations contractuelles entre GameTrend (Quentin Filippini, micro-entrepreneur, SIRET 89181769400021) et tout utilisateur souscrivant à un abonnement payant sur la plateforme <strong>gametrend.fr</strong>.
      </p>

      <h2>2. Offres d&apos;abonnement</h2>
      <p>GameTrend propose les formules d&apos;abonnement suivantes (prix TTC) :</p>
      <ul>
        <li><strong>GameTrend Premium Mensuel :</strong> 4,99 € par mois</li>
        <li><strong>GameTrend Premium Annuel :</strong> 49,99 € par an (économie de ~17 % par rapport à l&apos;abonnement mensuel)</li>
      </ul>
      <p>
        Ces tarifs peuvent être modifiés. Toute modification tarifaire sera notifiée aux abonnés existants au moins 30 jours avant son entrée en vigueur. Elle n&apos;affecte pas les périodes d&apos;abonnement en cours.
      </p>
      <p>
        La liste des fonctionnalités incluses dans chaque formule est disponible sur la page d&apos;abonnement du site et peut évoluer au fil du temps.
      </p>

      <h2>3. Commande et paiement</h2>
      <p>
        La souscription à un abonnement s&apos;effectue en ligne sur <strong>gametrend.fr</strong>. Le paiement est traité par un prestataire de paiement tiers sécurisé (Stripe ou équivalent certifié PCI-DSS). GameTrend ne stocke aucune donnée bancaire.
      </p>
      <p>
        Le contrat d&apos;abonnement est conclu lors de la confirmation de paiement. Une confirmation par email est envoyée à l&apos;adresse associée au compte.
      </p>
      <p>
        L&apos;abonnement est renouvelé automatiquement à la fin de chaque période, sauf résiliation préalable.
      </p>

      <h2>4. Droit de rétractation</h2>
      <p>
        Conformément à l&apos;article L.221-18 du Code de la consommation, <strong>vous disposez d&apos;un délai de 14 jours calendaires</strong> à compter de la souscription pour exercer votre droit de rétractation, sans avoir à justifier de motifs ni à payer de pénalités.
      </p>
      <p>
        <strong>Exception :</strong> en vertu de l&apos;article L.221-28, 13° du Code de la consommation, si vous avez expressément consenti à commencer l&apos;exécution du service avant l&apos;expiration du délai de rétractation et renoncé à votre droit de rétractation, aucun remboursement ne pourra être accordé pour les services déjà pleinement exécutés.
      </p>
      <p>
        Pour exercer votre droit de rétractation, contactez-nous à <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a> avec vos nom, email et date de souscription. Le remboursement sera effectué dans les 14 jours suivant la réception de votre demande, par le même moyen de paiement que celui utilisé lors de la souscription.
      </p>

      <h2>5. Résiliation</h2>
      <p>
        Vous pouvez résilier votre abonnement à tout moment depuis votre espace personnel (page Profil → Abonnement). La résiliation prend effet à la fin de la période d&apos;abonnement en cours — vous conservez l&apos;accès aux fonctionnalités premium jusqu&apos;à cette date, sans remboursement au prorata.
      </p>
      <p>
        GameTrend se réserve le droit de résilier un abonnement en cas de violation des CGU, sans remboursement.
      </p>

      <h2>6. Médiation</h2>
      <p>
        En cas de litige non résolu amiablement, vous pouvez recourir gratuitement à un médiateur de la consommation. Pour les consommateurs européens, la plateforme de résolution en ligne des litiges de la Commission européenne est accessible à l&apos;adresse : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>.
      </p>

      <h2>7. Programme d&apos;affiliation</h2>
      <p>
        GameTrend propose un programme d&apos;affiliation gratuit et facultatif, accessible à tout titulaire d&apos;un compte vérifié depuis l&apos;onglet « Affiliation » de son profil. Les conditions ci-dessous s&apos;appliquent à toute personne activant ce programme.
      </p>
      <h3>7.1 Mécanisme de commission</h3>
      <ul>
        <li><strong>Taux unique : 40 %</strong> du revenu net (après frais de paiement) perçu par GameTrend sur chaque abonnement souscrit par un filleul.</li>
        <li><strong>Commission récurrente</strong> : versée chaque mois tant que le filleul conserve un abonnement actif et payé.</li>
        <li><strong>Périmètre</strong> : la commission s&apos;applique uniquement aux abonnements payants. Les éventuels achats ponctuels (contenus, services à l&apos;unité) en sont exclus.</li>
        <li><strong>Conditionnelle</strong> : aucune commission n&apos;est due en cas de résiliation, remboursement, chargeback ou défaut de paiement du filleul. Les commissions déjà créditées correspondant à un mois remboursé sont annulées (statut <em>reversed</em>).</li>
      </ul>
      <h3>7.2 Attribution</h3>
      <p>
        L&apos;attribution se fait au premier clic (« first-click wins ») via un cookie de durée 90 jours déposé lors du clic sur un lien d&apos;affiliation. Si le filleul s&apos;inscrit dans cette fenêtre, il est définitivement rattaché à l&apos;affilié initial. Un compte ne peut être rattaché qu&apos;à un seul affilié, de manière irrévocable. L&apos;auto-affiliation est interdite.
      </p>
      <h3>7.3 Validation et versement</h3>
      <ul>
        <li>Les gains sont d&apos;abord crédités en statut <strong>« en attente »</strong> pendant 30 jours après la perception du paiement par GameTrend, afin de couvrir la fenêtre de remboursement.</li>
        <li>Passé ce délai, et en l&apos;absence de remboursement ou de chargeback, ils basculent en <strong>« validés »</strong> et deviennent éligibles au versement.</li>
        <li>Le versement est déclenché lorsque le solde validé atteint <strong>25 €</strong>. En dessous, le solde est reporté.</li>
        <li>Les versements sont effectués par virement bancaire SEPA, sur demande de l&apos;affilié, dans un délai maximal de 14 jours après réception des coordonnées bancaires complètes.</li>
        <li>L&apos;affilié est responsable de la déclaration fiscale et sociale des sommes perçues dans son pays de résidence.</li>
      </ul>
      <h3>7.4 Fraude et résiliation du programme</h3>
      <p>
        GameTrend se réserve le droit de suspendre, annuler ou retenir tout gain en cas de comportement frauduleux ou abusif (création de faux comptes, achat de trafic, spam, incitation trompeuse, violation des CGU). En cas de fraude avérée, le compte affilié peut être résilié sans préavis et les sommes en attente définitivement annulées.
      </p>
      <p>
        L&apos;affilié peut quitter le programme à tout moment depuis son tableau de bord. Les commissions déjà validées restent dues et seront versées selon les conditions ci-dessus.
      </p>

      <h2>8. Droit applicable</h2>
      <p>
        Les présentes CGV sont soumises au droit français. En cas de litige, les tribunaux compétents seront ceux du ressort du Tribunal Judiciaire de Chartres, sous réserve des dispositions impératives protectrices des consommateurs dans leur pays de résidence.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question relative à votre abonnement ou au programme d&apos;affiliation : <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}

function CGVEnglish() {
  return (
    <>
      <h1>Subscription Terms</h1>
      <p className="text-surface-500 text-xs">Last updated: April 2025</p>
      <hr />

      <h2>1. Purpose</h2>
      <p>
        These Subscription Terms govern the contractual relationship between GameTrend (Quentin Filippini, French sole proprietor, SIRET 89181769400021) and any user subscribing to a paid plan on the <strong>gametrend.fr</strong> platform.
      </p>

      <h2>2. Subscription plans</h2>
      <p>GameTrend offers the following subscription plans (prices include applicable French VAT):</p>
      <ul>
        <li><strong>GameTrend Premium Monthly:</strong> €4.99 per month</li>
        <li><strong>GameTrend Premium Yearly:</strong> €49.99 per year (~17% saving compared to the monthly plan)</li>
      </ul>
      <p>
        These prices may change. Any price change will be notified to existing subscribers at least 30 days before it takes effect. It does not affect ongoing subscription periods.
      </p>
      <p>
        The list of features included in each plan is available on the subscription page and may evolve over time.
      </p>

      <h2>3. Order and payment</h2>
      <p>
        Subscriptions are taken out online at <strong>gametrend.fr</strong>. Payment is processed by a secure third-party payment provider (Stripe or an equivalent PCI-DSS-certified provider). GameTrend does not store any payment card data.
      </p>
      <p>
        The subscription contract is concluded upon payment confirmation. A confirmation email is sent to the address associated with the account.
      </p>
      <p>
        The subscription is automatically renewed at the end of each period unless cancelled beforehand.
      </p>

      <h2>4. Right of withdrawal (EU consumers)</h2>
      <p>
        In accordance with article L.221-18 of the French Consumer Code, <strong>you have 14 calendar days</strong> from the subscription date to exercise your right of withdrawal, without giving reasons and without paying any penalty.
      </p>
      <p>
        <strong>Exception:</strong> under article L.221-28, 13° of the French Consumer Code, if you have expressly consented to the service starting before the end of the withdrawal period and have waived your right of withdrawal, no refund will be granted for services already fully performed.
      </p>
      <p>
        To exercise your right of withdrawal, contact us at <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a> with your name, email and subscription date. The refund will be issued within 14 days of receiving your request, using the same payment method used for the subscription.
      </p>

      <h2>5. Cancellation</h2>
      <p>
        You can cancel your subscription at any time from your account area (Profile page → Subscription). Cancellation takes effect at the end of the current subscription period — you keep access to premium features until that date, with no pro-rata refund.
      </p>
      <p>
        GameTrend reserves the right to cancel a subscription in case of breach of the Terms of Service, without refund.
      </p>

      <h2>6. Dispute resolution</h2>
      <p>
        In case of an unresolved dispute, you may use a consumer mediator free of charge. For European consumers, the European Commission&apos;s online dispute resolution platform is available at: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>.
      </p>

      <h2>7. Affiliate program</h2>
      <p>
        GameTrend offers a free, optional affiliate program available to any verified account holder from the &quot;Affiliate&quot; tab of their profile. The terms below apply to anyone activating this program.
      </p>
      <h3>7.1 Commission mechanism</h3>
      <ul>
        <li><strong>Single rate: 40 %</strong> of the net revenue (after payment fees) received by GameTrend on each subscription taken out by a referred user.</li>
        <li><strong>Recurring commission</strong>: paid every month for as long as the referred user maintains an active and paid subscription.</li>
        <li><strong>Scope</strong>: commission applies only to paid subscriptions. Any one-time purchases (content, à-la-carte services) are excluded.</li>
        <li><strong>Conditional</strong>: no commission is owed in case of cancellation, refund, chargeback or payment failure by the referred user. Commissions already credited that correspond to a refunded month are reversed.</li>
      </ul>
      <h3>7.2 Attribution</h3>
      <p>
        Attribution is done on a first-click basis via a 90-day cookie set when the referral link is clicked. If the referred user signs up within this window, they are permanently attached to the original affiliate. An account can only be linked to a single affiliate, irrevocably. Self-referral is prohibited.
      </p>
      <h3>7.3 Validation and payout</h3>
      <ul>
        <li>Earnings are first credited as <strong>&quot;pending&quot;</strong> for 30 days after GameTrend receives the payment, to cover the refund window.</li>
        <li>After this period, in the absence of any refund or chargeback, they switch to <strong>&quot;approved&quot;</strong> and become eligible for payout.</li>
        <li>Payout is triggered when the approved balance reaches <strong>€25</strong>. Below this threshold, the balance carries over.</li>
        <li>Payouts are made by SEPA bank transfer, upon request from the affiliate, within a maximum of 14 days after receipt of complete bank details.</li>
        <li>The affiliate is responsible for declaring the amounts received under the tax and social security rules of their country of residence.</li>
      </ul>
      <h3>7.4 Fraud and termination</h3>
      <p>
        GameTrend reserves the right to suspend, cancel or withhold any earnings in case of fraudulent or abusive behavior (fake accounts, traffic buying, spam, misleading promotion, breach of the Terms of Service). In case of proven fraud, the affiliate account may be terminated without notice and pending earnings permanently cancelled.
      </p>
      <p>
        The affiliate can leave the program at any time from their dashboard. Commissions already approved remain due and will be paid out under the conditions above.
      </p>

      <h2>8. Governing law</h2>
      <p>
        These Subscription Terms are governed by French law. In case of dispute, the competent courts shall be those within the jurisdiction of the Tribunal Judiciaire de Chartres, subject to mandatory consumer-protection rules applicable in the user&apos;s country of residence.
      </p>

      <h2>9. Contact</h2>
      <p>
        For any question regarding your subscription or the affiliate program: <a href="mailto:contact@gametrend.fr">contact@gametrend.fr</a>
      </p>
    </>
  );
}
