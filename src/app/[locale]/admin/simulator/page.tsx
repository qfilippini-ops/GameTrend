import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import SimulatorClient from "./SimulatorClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminSimulatorPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    notFound();
  }
  return <SimulatorClient />;
}
