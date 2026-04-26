"use client";

import { useState, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import OnlineLobbyShell from "@/games/online/components/OnlineLobbyShell";
import OutbidRoomSettings, {
  type OutbidRoomSettingsValue,
} from "@/games/outbid/components/online/OutbidRoomSettings";
import { createOutbidRoom } from "@/app/actions/outbid-rooms";
import {
  OUTBID_TOUR_DEFAULT_SECONDS,
  OUTBID_TEAM_DEFAULT,
} from "@/games/outbid/online-config";
import { safeJoinRoom } from "@/games/online/lib/safeJoinRoom";

function OutbidOnlineLobbyContent() {
  const t = useTranslations("games.outbid.online.lobby");
  const tShell = useTranslations("games.outbid.online.shell");
  const router = useRouter();

  const [settings, setSettings] = useState<OutbidRoomSettingsValue>({
    presetId: "",
    teamSize: OUTBID_TEAM_DEFAULT,
    tourTimeSeconds: OUTBID_TOUR_DEFAULT_SECONDS,
    openingBidder: "alternate",
  });

  return (
    <OnlineLobbyShell
      backHref="/games/outbid"
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
        <OutbidRoomSettings value={settings} onChange={setSettings} />
      )}
      onCreate={async ({ isPrivate }) => {
        const res = await createOutbidRoom({
          presetId: settings.presetId || null,
          teamSize: settings.teamSize,
          tourTimeSeconds: settings.tourTimeSeconds,
          openingBidder: settings.openingBidder,
          isPrivate,
        });
        if ("error" in res) return { error: res.error };
        return { code: res.code };
      }}
      onJoin={async ({ code, displayName }) => {
        try {
          const supabase = (await import("@/lib/supabase/client")).createClient();
          let {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            const { data, error: anonErr } =
              await supabase.auth.signInAnonymously();
            if (anonErr || !data.user) {
              return {
                error: tShell("errAuth", { message: anonErr?.message ?? "?" }),
              };
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

          // Pré-check game_type (safe_join_room ne contrôle pas le type
          // de jeu, juste l'existence de la room et la phase 'lobby').
          const { data: room } = await supabase
            .from("game_rooms")
            .select("game_type")
            .eq("id", code)
            .maybeSingle();
          if (!room) return { error: tShell("errRoomNotFound") };
          if (room.game_type !== "outbid")
            return { error: tShell("errWrongGame") };

          // Atomic : kick autre lobby + capacité (Outbid = 2) + pseudo +
          // insert. Pour Outbid, errLobbyFull est mappé sur errRoomFull
          // (libellé existant "Salon complet, Outbid se joue à 2").
          const res = await safeJoinRoom(supabase, code, displayName, {
            errRoomNotFound: tShell("errRoomNotFound"),
            errAlreadyStarted: tShell("errAlreadyStarted"),
            errNickTaken: tShell("errNickTaken"),
            errLobbyFull: tShell("errRoomFull"),
          });
          if (!res.ok) return { error: res.error ?? tShell("errServer") };
          return { code };
        } catch (e) {
          console.error(e);
          return { error: tShell("errServer") };
        }
      }}
      onNavigateToRoom={(code) => router.push(`/games/outbid/online/${code}`)}
    />
  );
}

export default function OutbidOnlineLobbyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-950 flex items-center justify-center text-white" />
      }
    >
      <OutbidOnlineLobbyContent />
    </Suspense>
  );
}
