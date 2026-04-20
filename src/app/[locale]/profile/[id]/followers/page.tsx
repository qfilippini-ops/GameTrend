"use client";

import FollowList from "@/components/social/FollowList";
import Header from "@/components/layout/Header";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

export default function FollowersPage() {
  const t = useTranslations("profile");
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-surface-950">
      <Header backHref={`/profile/${id}`} title={t("followersTitle")} />
      <FollowList userId={id} mode="followers" />
    </div>
  );
}
