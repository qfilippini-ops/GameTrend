"use client";

import FollowList from "@/components/social/FollowList";
import Header from "@/components/layout/Header";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

export default function FollowingPage() {
  const t = useTranslations("profile");
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-surface-950">
      <Header backHref={`/profile/${id}`} title={t("followingTitle")} />
      <FollowList userId={id} mode="following" />
    </div>
  );
}
