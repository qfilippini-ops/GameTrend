"use client";

import FollowList from "@/components/social/FollowList";
import Header from "@/components/layout/Header";
import { useParams } from "next/navigation";

export default function FollowersPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-surface-950">
      <Header backHref={`/profile/${id}`} title="Abonnés" />
      <FollowList userId={id} mode="followers" />
    </div>
  );
}
