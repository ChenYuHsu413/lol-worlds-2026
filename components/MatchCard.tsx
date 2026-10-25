import { taipeiMonthDay, taipeiTime } from "@/lib/time";
import type { Match, Seat } from "@/lib/types";
import { involves } from "./focus";
import { hasGames, useOpenGames } from "./games-context";
import { useSeriesResult } from "./result-context";
import { TeamLogo } from "./TeamLogo";

export const CARD_W = 216;
export const CARD_H = 88;

interface Props {
  match: Match;
  label: string;
  provisional?: boolean;
  focus: string | null;
  seats: [Seat, Seat]; // 上格、下格（由來源決定，不依 API teams 順序）
  x: number;
  y: number;
}

/** 籤表中的一場比賽，以絕對定位放在籤表容器內 */
export function MatchCard({ match: m, label, provisional, focus, seats, x, y }: Props) {
  const dimmed = focus !== null && !involves(m, focus);
  const live = m.state === "inProgress";
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  const r = useSeriesResult(m);
  // 結果更新中不顯示比分（避免 0:0）；暫定比分依 team id 對應
  const scoreOf = (seat: Seat) =>
    r.kind === "official" ? seat.score : r.kind === "pending" ? null : seat.team?.id === m.teamA?.id ? r.scoreA : r.scoreB;
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
          ) : r.kind !== "official" ? (
            <span className="text-accent-2">{r.kind === "pending" ? "結果更新中" : "暫定比分"}</span>
          ) : m.startTime ? (
            `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)}・Bo${m.bestOf}`
          ) : (
            `Bo${m.bestOf}`
          )}
        </span>
      </div>
      <TeamRow seat={{ ...seats[0], score: scoreOf(seats[0]) }} focus={focus} />
      <TeamRow seat={{ ...seats[1], score: scoreOf(seats[1]) }} focus={focus} />
    </div>
  );
}

function TeamRow({ seat: { team, score, result, placeholder }, focus }: { seat: Seat; focus: string | null }) {
  const won = result === "win";
  const lost = result === "loss";
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
        {team?.code ?? placeholder ?? "TBD"}
      </span>
      <span className={`font-mono font-bold tabular-nums ${won ? "text-win" : lost ? "text-muted" : ""}`}>
        {score ?? ""}
      </span>
    </div>
  );
}
