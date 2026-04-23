"use client";

import { useTranslations } from "next-intl";
import RoomShell, {
  type RoomShellLabels,
} from "@/games/online/components/RoomShell";
import OutbidRoomWaiting from "@/games/outbid/components/online/OutbidRoomWaiting";
import OutbidOnlinePlay from "@/games/outbid/components/online/OutbidOnlinePlay";
import OutbidOnlineResult from "@/games/outbid/components/online/OutbidOnlineResult";

export default function OutbidOnlineRoomPage() {
  const t = useTranslations("games.outbid.online.room");
  const tShared = useTranslations("games.outbid.online.shellShared");

  const labels: RoomShellLabels = {
    join: {
      salon: t("joinTitle"),
      yourNickname: tShared("enterNickname"),
      nicknamePlaceholder: tShared("nicknamePlaceholder"),
      joinCta: tShared("joinCta"),
      loading: tShared("loadingShort"),
      connecting: tShared("connecting"),
      errEnterNick: tShared("errEnterNick"),
      errRoomNotFound: tShared("errRoomNotFound"),
      errAlreadyStarted: tShared("errAlreadyStarted"),
      errNickTaken: tShared("errNickTaken"),
      errAuth: (msg: string) => tShared("errAuth", { message: msg }),
    },
    buttons: {
      leave: tShared("leave"),
      menu: tShared("menu"),
      cancel: tShared("cancel"),
      options: tShared("options"),
    },
    connecting: tShared("connecting"),
    identifying: tShared("identifying"),
    back: tShared("back"),
    ok: tShared("ok"),
    errRoomNotFound: (reason?: string) =>
      reason
        ? tShared("errRoomNotFoundReason", { reason })
        : tShared("errRoomNotFound"),
    errAlreadyStarted: tShared("errAlreadyStarted"),
    evtPlayerLeft: (name: string) => tShared("evtPlayerLeft", { name }),
    evtHostLeft: (name: string) => tShared("evtHostLeft", { name }),
    evtNewHost: (name: string) => tShared("evtNewHost", { name }),
    evtNewHostYou: tShared("evtNewHostYou"),
    evtKicked: (name: string) => tShared("evtKicked", { name }),
  };

  return (
    <RoomShell
      gameHomeHref="/games/outbid"
      labels={labels}
      renderPhase={(ctx) => {
        switch (ctx.room.phase) {
          case "lobby":
            return (
              <OutbidRoomWaiting
                room={ctx.room}
                players={ctx.players}
                myName={ctx.myName}
                isHost={ctx.isHost}
                onlineNames={ctx.onlineNames}
                playerAvatars={ctx.playerAvatars}
                onVoluntaryLeave={ctx.markVoluntaryLeave}
              />
            );
          case "playing":
            return (
              <OutbidOnlinePlay
                room={ctx.room}
                players={ctx.players}
                messages={ctx.messages}
                myName={ctx.myName}
                onlineNames={ctx.onlineNames}
                playerAvatars={ctx.playerAvatars}
              />
            );
          case "result":
            return (
              <OutbidOnlineResult
                room={ctx.room}
                myName={ctx.myName}
                totalPlayers={ctx.players.length}
                replayVotes={ctx.replayVotes}
                players={ctx.players}
                playerAvatars={ctx.playerAvatars}
              />
            );
          default:
            return null;
        }
      }}
    />
  );
}
