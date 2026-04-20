import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Charge dynamiquement les messages JSON pour la locale demandée.
 * Le code du fichier est compilé côté serveur ; les messages sont
 * envoyés au client via NextIntlClientProvider.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Format par défaut pour dates/nombres si la locale est passée à
    // <FormattedDate /> sans format explicite.
    timeZone: "Europe/Paris",
  };
});
