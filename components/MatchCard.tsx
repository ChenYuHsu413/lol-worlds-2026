import { taipeiMonthDay, taipeiTime } from "@/lib/time";
import type { Match, Team } from "@/lib/types";
import { involves } from "./focus";
import { hasGames, useOpenGames } from "./games-context";
import { TeamLogo } from "./TeamLogo";

export const CARD_W = 216;
export const CARD_H = 88;

interface Props {
  match: Match;
  label: string;
  provisional?: boolean;
  focus: string | null;
  sourceLabels?: [string, string] | null; // 隊伍未定時顯示來源，如「八強賽 1 勝者」
  x: number;
  y: number;
}

/** 籤表中的一場比賽，以絕對定位放在籤表容器內 */
export function MatchCard({ match: m, label, provisional, focus, sourceLabels, x, y }: Props) {
  const dimmed = focus !== null && !involves(m, focus);
  const live = m.state === "inProgress";
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  return (
    <div
      onClick={clickable ? () => openGames(m.id) : undefined}
      title={clickable ? "查看小局細節" : undefined}
      className={`absolute flex flex-col overflow-hidden rounded-md bg-panel text-sm transition-opacity ${
        clickable ? "cursor-pointer hover:ring-2 hover:ring-accent/60" : ""
      } ${
        provisional ? "border border-dashed border-muted/60" : live ? "border border-live" : "border border-line"
      } ${dimmed ? "opacity-30" : ""}`}
      style={{ left: x, top: y, width: CARD_W, height: CARD_H }}
    >
      <div className="flex items-center justify-between bg-panel-2 px-2 py-0.5 text-[11px] text-muted">
        <span className="truncate font-semibold">{label}</span>
        <span className="shrink-0 font-mono">
          {live ? (
            <span className="live-blink font-bold text-live">● LIVE</span>
          ) : m.startTime ? (
            `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)}・Bo${m.bestOf}`
          ) : (
            `Bo${m.bestOf}`
          )}
        </span>
      </div>
      <TeamRow team={m.teamA} score={m.scoreA} m={m} side="A" focus={focus} source={sourceLabels?.[0]} />
      <TeamRow team={m.teamB} score={m.scoreB} m={m} side="B" focus={focus} source={sourceLabels?.[1]} />
    </div>
  );
}

function TeamRow({
  team,
  score,
  m,
  side,
  focus,
  source,
}: {
  team: Team | null;
  score: number;
  m: Match;
  side: "A" | "B";
  focus: string | null;
  source?: string;
}) {
  const done = m.state === "completed";
  const won = done && m.winner === side;
  const lost = done && m.winner !== null && m.winner !== side;
  const focused = team !== null && team.id === focus;
  return (
    <div
      className={`flex flex-1 items-center gap-2 border-t border-line/60 px-2 ${won ? "bg-win-bg" : ""} ${
        focused ? "ring-1 ring-inset ring-accent" : ""
      }`}
    >
      <TeamLogo team={team} size={18} />
      <span
        className={`min-w-0 flex-1 truncate ${team ? (lost ? "text-muted" : "font-semibold") : "text-xs text-muted"}`}
        title={team?.name}
      >
        {team?.code ?? source ?? "TBD"}
      </span>
      <span className={`font-mono font-bold tabular-nums ${won ? "text-win" : lost ? "text-muted" : ""}`}>
        {m.state === "unstarted" ? "" : score}
      </span>
    </div>
  );
}
