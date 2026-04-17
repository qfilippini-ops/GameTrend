"use client";

import FollowList from "@/components/social/FollowList";
import Header from "@/components/layout/Header";
import { useParams } from "next/navigation";

export default function FollowingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-surface-950">
      <Header backHref={`/profile/${id}`} title="Abonnements" />
      <FollowList userId={id} mode="following" />
    </div>
  );
}
