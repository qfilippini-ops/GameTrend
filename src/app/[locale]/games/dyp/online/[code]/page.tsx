"use client";

import { useTranslations } from "next-intl";
import RoomShell, {
  type RoomShellLabels,
} from "@/games/online/components/RoomShell";
import DypRoomWaiting from "@/games/dyp/components/online/DypRoomWaiting";
import DypOnlinePlay from "@/games/dyp/components/online/DypOnlinePlay";
import DypOnlineResult from "@/games/dyp/components/online/DypOnlineResult";

export default function DypOnlineRoomPage() {
  const t = useTranslations("games.dyp.online.room");
  const tShared = useTranslations("games.dyp.online.shellShared");

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
      errLobbyFull: tShared("errLobbyFull"),
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
      gameHomeHref="/games/dyp"
      labels={labels}
      renderPhase={(ctx) => {
        switch (ctx.room.phase) {
          case "lobby":
            return (
              <DypRoomWaiting
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
              <DypOnlinePlay
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
              <DypOnlineResult
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
