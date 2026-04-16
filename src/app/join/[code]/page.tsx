import { redirect } from "next/navigation";

export default function JoinRedirect({
  params,
}: {
  params: { code: string };
}) {
  // Redirect /join/AB3X9K → /games/ghostword/online/AB3X9K
  redirect(`/games/ghostword/online/${params.code.toUpperCase()}`);
}
