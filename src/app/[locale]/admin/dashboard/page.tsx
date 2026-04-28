import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dashboard interne de suivi coûts/revenus. Accessible uniquement aux user
 * IDs listés dans ADMIN_USER_IDS. Toute autre requête → notFound() → 404
 * (volontairement opaque pour ne pas révéler que la route existe).
 */
export default async function AdminDashboardPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    notFound();
  }
  return <AdminDashboardClient />;
}
