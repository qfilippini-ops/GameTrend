import { redirect } from "@/i18n/navigation";

export default async function JoinRedirect({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  redirect({ href: `/games/ghostword/online/${code.toUpperCase()}`, locale });
}
