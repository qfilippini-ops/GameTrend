"use client";

import { useTranslations } from "next-intl";
import RoomShell, {
  type RoomShellLabels,
} from "@/games/online/components/RoomShell";
import BlindRankRoomWaiting from "@/games/blindrank/components/online/BlindRankRoomWaiting";
import BlindRankOnlinePlay from "@/games/blindrank/components/online/BlindRankOnlinePlay";
import BlindRankOnlineResult from "@/games/blindrank/components/online/BlindRankOnlineResult";

export default function BlindRankOnlineRoomPage() {
  const t = useTranslations("games.blindrank.online.room");
  const tShared = useTranslations("games.blindrank.online.shellShared");

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
      gameHomeHref="/games/blindrank"
      labels={labels}
      renderPhase={(ctx) => {
        switch (ctx.room.phase) {
          case "lobby":
            return (
              <BlindRankRoomWaiting
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
              <BlindRankOnlinePlay
                room={ctx.room}
                players={ctx.players}
                messages={ctx.messages}
                votes={ctx.votes}
                myName={ctx.myName}
                onlineNames={ctx.onlineNames}
                playerAvatars={ctx.playerAvatars}
              />
            );
          case "result":
            return (
              <BlindRankOnlineResult
                room={ctx.room}
                myName={ctx.myName}
                totalPlayers={ctx.players.length}
                replayVotes={ctx.replayVotes}
              />
            );
          default:
            return null;
        }
      }}
    />
  );
}
