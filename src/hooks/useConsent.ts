"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook unifié de consentement RGPD. Source de vérité = CMP Google (TCF v2.2)
 * injectée par le script `adsbygoogle.js` dans les zones EEE/UK/CH.
 *
 * Comportement :
 *   - En EEE/UK/CH : on attend `eventStatus === "tcloaded"` ou
 *     `"useractioncomplete"`, puis on lit `purpose.consents`.
 *   - Hors RGPD (USA, Asie, etc.) : la CMP ne se charge pas, `__tcfapi` reste
 *     indisponible. Après FALLBACK_DELAY_MS sans réponse, on assume un
 *     consentement implicite (légal hors RGPD).
 *
 * Mapping IAB Purposes (TCF v2.2) :
 *   - 1 : Stocker / accéder à des informations sur l'appareil  → cookies
 *   - 2 : Sélection d'annonces basiques
 *   - 3 : Création d'un profil d'annonces personnalisées
 *   - 4 : Sélection d'annonces personnalisées
 *   - 7 : Mesure de performance des annonces
 *   - 8 : Mesure de performance du contenu              → analytics produit
 *   - 9 : Études de marché
 *   - 10 : Développement / amélioration des produits
 *
 *   → analyticsConsent = purpose 1 ET purpose 8
 *   → adsConsent       = purpose 1 (suffit pour servir des ads contextuelles
 *                       non-personnalisées ; AdSense décide ensuite perso vs
 *                       contextuel à partir du TC string complet, donc inutile
 *                       de bloquer côté front quand 2..4 sont refusés).
 *   → adsPersonalized  = purpose 1 ET purposes 2..4 (info uniquement,
 *                       AdSense l'évalue déjà via le TC string).
 */

const FALLBACK_DELAY_MS = 4000;
const POLL_INTERVAL_MS = 200;

interface ConsentState {
  /** True dès qu'une décision est connue (utilisateur a choisi OU hors EEE). */
  ready: boolean;
  /** True si l'utilisateur est dans une zone RGPD (selon Google). */
  gdprApplies: boolean;
  /** True si on peut activer PostHog (purpose 1 + 8). */
  analyticsConsent: boolean;
  /**
   * True si on peut afficher des ads (purpose 1 = storage). AdSense décide
   * ensuite du mode perso vs contextuel via le TC string complet.
   */
  adsConsent: boolean;
  /** Info : true si l'utilisateur a aussi consenti aux ads personnalisées. */
  adsPersonalized: boolean;
}

const INITIAL_STATE: ConsentState = {
  ready: false,
  gdprApplies: false,
  analyticsConsent: false,
  adsConsent: false,
  adsPersonalized: false,
};

export function useConsent() {
  const [state, setState] = useState<ConsentState>(INITIAL_STATE);
  const listenerIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    function applyTcData(tcData: TCData | null): void {
      if (cancelled || !tcData) return;

      // Hors EEE → consentement implicite, on débloque tout immédiatement.
      if (tcData.gdprApplies === false) {
        setState({
          ready: true,
          gdprApplies: false,
          analyticsConsent: true,
          adsConsent: true,
          adsPersonalized: true,
        });
        return;
      }

      // En EEE : on n'agit que sur les statuts "décisifs".
      const decided =
        tcData.eventStatus === "tcloaded" ||
        tcData.eventStatus === "useractioncomplete";

      if (!decided) {
        // Bannière affichée mais pas encore choisi → reste en pending.
        setState((s) => ({ ...s, gdprApplies: true, ready: false }));
        return;
      }

      const purposes = tcData.purpose?.consents ?? {};
      const p = (id: number) => purposes[String(id)] === true;

      setState({
        ready: true,
        gdprApplies: true,
        analyticsConsent: p(1) && p(8),
        adsConsent: p(1),
        adsPersonalized: p(1) && p(2) && p(3) && p(4),
      });
    }

    function tryAttach(): boolean {
      if (typeof window.__tcfapi !== "function") return false;
      window.__tcfapi(
        "addEventListener",
        2,
        (tcData, success) => {
          if (!success || !tcData) return;
          if (typeof tcData.listenerId === "number") {
            listenerIdRef.current = tcData.listenerId;
          }
          applyTcData(tcData);
        }
      );
      return true;
    }

    if (!tryAttach()) {
      pollTimer = setInterval(() => {
        if (cancelled) return;
        if (tryAttach()) {
          if (pollTimer) clearInterval(pollTimer);
        }
      }, POLL_INTERVAL_MS);
    }

    // Filet de sécurité : si après FALLBACK_DELAY_MS aucune CMP n'a répondu,
    // on considère que l'utilisateur est hors EEE (Google CMP n'est injectée
    // que dans les zones soumises au RGPD).
    fallbackTimer = setTimeout(() => {
      if (cancelled) return;
      setState((s) => {
        if (s.ready) return s;
        return {
          ready: true,
          gdprApplies: false,
          analyticsConsent: true,
          adsConsent: true,
          adsPersonalized: true,
        };
      });
      if (pollTimer) clearInterval(pollTimer);
    }, FALLBACK_DELAY_MS);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      const id = listenerIdRef.current;
      if (id !== undefined && typeof window.__tcfapi === "function") {
        window.__tcfapi("removeEventListener", 2, () => {}, id);
      }
    };
  }, []);

  /**
   * Ré-affiche la bannière de consentement Google (depuis un bouton "Gérer
   * mes cookies"). No-op hors EEE car la CMP n'est pas chargée.
   */
  const openSettings = useCallback(() => {
    if (typeof window === "undefined") return;
    const fc = window.googlefc;

    if (fc?.showRevocationMessage) {
      fc.showRevocationMessage();
      return;
    }

    if (fc?.callbackQueue) {
      fc.callbackQueue.push({
        CONSENT_DATA_READY: () => fc.showRevocationMessage?.(),
      });
      return;
    }

    // Pas de CMP injectée → utilisateur hors EEE.
    if (typeof window.alert === "function") {
      window.alert(
        "Aucun paramètre de cookie n'est requis dans votre région."
      );
    }
  }, []);

  return { ...state, openSettings };
}
