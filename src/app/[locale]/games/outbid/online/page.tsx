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
import { leaveAllOtherRooms } from "@/app/actions/rooms";

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

          const { data: room } = await supabase
            .from("game_rooms")
            .select("phase, game_type")
            .eq("id", code)
            .maybeSingle();
          if (!room) return { error: tShell("errRoomNotFound") };
          if (room.game_type !== "outbid")
            return { error: tShell("errWrongGame") };
          if (room.phase !== "lobby")
            return { error: tShell("errAlreadyStarted") };

          const { data: alreadyIn } = await supabase
            .from("room_players")
            .select("display_name")
            .eq("room_id", code)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!alreadyIn) {
            await leaveAllOtherRooms(code);
            const { data: taken } = await supabase
              .from("room_players")
              .select("display_name")
              .eq("room_id", code)
              .eq("display_name", displayName)
              .maybeSingle();
            if (taken) return { error: tShell("errNickTaken") };

            // Outbid : 1v1 strict, refuse au-delà de 2 joueurs
            const { count } = await supabase
              .from("room_players")
              .select("*", { count: "exact", head: true })
              .eq("room_id", code);
            if ((count ?? 0) >= 2) {
              return { error: tShell("errRoomFull") };
            }

            const { error: insertErr } = await supabase
              .from("room_players")
              .insert({
                room_id: code,
                user_id: user.id,
                display_name: displayName,
                is_host: false,
                join_order: count ?? 1,
              });
            if (insertErr) return { error: insertErr.message };
          }

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
