import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Wrappers localisés des primitives de navigation Next.js.
 *
 * Utiliser ces imports À LA PLACE de `next/link`, `next/navigation` :
 *   - `Link` ajoute automatiquement le préfixe de langue courant
 *   - `useRouter().push("/foo")` redirige vers `/fr/foo` ou `/en/foo` selon la locale active
 *   - `redirect("/foo")` idem côté server
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
