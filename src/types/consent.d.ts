/**
 * Types pour l'API IAB TCF v2.2 et la CMP Google (Funding Choices) injectées
 * par le script Google AdSense (`adsbygoogle.js`) dans les zones EEE/UK/CH.
 *
 * Référence : https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20CMP%20API%20v2.md
 */

interface TCData {
  /** True quand l'utilisateur est dans une zone soumise au RGPD. */
  gdprApplies?: boolean;
  /** Statut courant du framework. */
  eventStatus?:
    | "tcloaded"           // CMP prête, TC string disponible
    | "cmpuishown"         // Bannière affichée à l'utilisateur
    | "useractioncomplete" // L'utilisateur vient de faire un choix
    | string;
  /** ID assigné par addEventListener, à passer à removeEventListener. */
  listenerId?: number;
  /** Consentements par "purpose" (clé = ID 1..10). */
  purpose?: {
    consents?: Record<string, boolean>;
    legitimateInterests?: Record<string, boolean>;
  };
  /** Consentements par vendor (clé = ID vendor). */
  vendor?: {
    consents?: Record<string, boolean>;
    legitimateInterests?: Record<string, boolean>;
  };
  tcString?: string;
}

type TcfApiCallback = (tcData: TCData | null, success: boolean) => void;

interface TcfApi {
  (
    command: "addEventListener" | "removeEventListener" | "getTCData" | "ping",
    version: 2,
    callback: TcfApiCallback,
    parameter?: number | string
  ): void;
}

/** API Google Funding Choices (CMP fournie par AdSense). */
interface GoogleFc {
  /** Ré-affiche la bannière de consentement (ex : depuis un bouton "Gérer"). */
  showRevocationMessage?: () => void;
  /** File d'attente de callbacks exécutés une fois la CMP initialisée. */
  callbackQueue?: Array<{
    CONSENT_DATA_READY?: () => void;
    CONSENT_API_READY?: () => void;
  }>;
}

declare global {
  interface Window {
    __tcfapi?: TcfApi;
    googlefc?: GoogleFc;
  }
}

export {};
