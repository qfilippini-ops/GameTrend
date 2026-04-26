"use client";

import { useState, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import OnlineLobbyShell from "@/games/online/components/OnlineLobbyShell";
import BlindRankRoomSettings, {
  type BlindRankRoomSettingsValue,
} from "@/games/blindrank/components/online/BlindRankRoomSettings";
import { createBlindRankRoom } from "@/app/actions/blindrank-rooms";
import { BLINDRANK_TOUR_DEFAULT_SECONDS } from "@/games/blindrank/online-config";
import { safeJoinRoom } from "@/games/online/lib/safeJoinRoom";

function BlindRankOnlineLobbyContent() {
  const t = useTranslations("games.blindrank.online.lobby");
  const tShell = useTranslations("games.blindrank.online.shell");
  const router = useRouter();

  const [settings, setSettings] = useState<BlindRankRoomSettingsValue>({
    presetId: "",
    rackSize: 10,
    tourTimeSeconds: BLINDRANK_TOUR_DEFAULT_SECONDS,
    tieBreak: "low",
  });

  return (
    <OnlineLobbyShell
      backHref="/games/blindrank"
      labels={{
        lobbyTitle: t("title"),
        tabCreate: tShell("tabCreate"),
        tabJoin: tShell("tabJoin"),
        yourAccount: tShell("yourAccount"),
        yourNickname: tShell("yourNickname"),
        nicknamePlaceholder: tShell("nicknamePlaceholder"),
        roomCodeLabel: tShell("roomCodeLabel"),
        roomCodePlaceholder: tShell("roomCodePlaceholder"),
        visibility: tShell("visibility"),
        visibilityPrivate: tShell("visibilityPrivate"),
        visibilityPublic: tShell("visibilityPublic"),
        private: tShell("private"),
        public: tShell("public"),
        createCta: t("createCta"),
        joinCta: tShell("joinCta"),
        loadingShort: tShell("loadingShort"),
        errEnterNick: tShell("errEnterNick"),
        errInvalidCode: tShell("errInvalidCode"),
        errServer: tShell("errServer"),
        anonHint: tShell("anonHint"),
        loginCta: tShell("loginCta"),
        loginSuffix: tShell("loginSuffix"),
      }}
      renderCreateSettings={() => (
        <BlindRankRoomSettings value={settings} onChange={setSettings} />
      )}
      onCreate={async ({ isPrivate }) => {
        const res = await createBlindRankRoom({
          presetId: settings.presetId || null,
          rackSize: settings.rackSize,
          tourTimeSeconds: settings.tourTimeSeconds,
          tieBreak: settings.tieBreak,
          isPrivate,
        });
        if ("error" in res) return { error: res.error };
        return { code: res.code };
      }}
      onJoin={async ({ code, displayName }) => {
        // Auth anonyme + insertion player côté client (réutilise pattern GhostWord)
        try {
          const supabase = (await import("@/lib/supabase/client")).createClient();
          let {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            const { data, error: anonErr } =
              await supabase.auth.signInAnonymously();
            if (anonErr || !data.user) {
              return { error: tShell("errAuth", { message: anonErr?.message ?? "?" }) };
            }
            user = data.user;
            if (data.session) {
              await fetch("/api/auth/set-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                }),
              });
            }
          }

          const { data: room } = await supabase
            .from("game_rooms")
            .select("game_type")
            .eq("id", code)
            .maybeSingle();
          if (!room) return { error: tShell("errRoomNotFound") };
          if (room.game_type !== "blindrank")
            return { error: tShell("errWrongGame") };

          const res = await safeJoinRoom(supabase, code, displayName, {
            errRoomNotFound: tShell("errRoomNotFound"),
            errAlreadyStarted: tShell("errAlreadyStarted"),
            errNickTaken: tShell("errNickTaken"),
            errLobbyFull: tShell("errLobbyFull"),
          });
          if (!res.ok) return { error: res.error ?? tShell("errServer") };
          return { code };
        } catch (e) {
          console.error(e);
          return { error: tShell("errServer") };
        }
      }}
      onNavigateToRoom={(code) => router.push(`/games/blindrank/online/${code}`)}
    />
  );
}

export default function BlindRankOnlineLobbyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-950 flex items-center justify-center text-white" />
      }
    >
      <BlindRankOnlineLobbyContent />
    </Suspense>
  );
}
