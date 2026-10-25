import { useLayoutEffect, useRef, useState } from "react";
import { taipeiMonthDay, taipeiTime } from "@/lib/time";
import { seatsInApiOrder } from "@/lib/bracket";
import type { Match, Seat, Team } from "@/lib/types";
import { involves } from "./focus";
import { hasGames, useOpenGames } from "./games-context";
import { SeriesScore } from "./result-context";
import { TeamLogo } from "./TeamLogo";

interface Props {
  match: Match;
  label: string; // 場次名稱，例如「勝部首輪 A」「R3・2-0 晉級戰」「八強 1」
  next?: string | null; // 第三行：晉級去向
  provisional?: boolean; // 位置推測（虛線框）
  seats?: [Seat, Seat]; // 籤表格位（由來源決定）；未給時依 API 原始順序（賽程、瑞士輪）
  focus: string | null; // 隊伍篩選
  selected?: string | null; // 瑞士輪點選的隊伍（路徑高亮）
  onTeamClick?: (teamId: string) => void;
  timeOnly?: boolean; // 賽程列表已有日期標題時只顯示時間
}

/** 手機版（< 768px）共用對戰卡：Play-In、瑞士輪、淘汰賽、賽程共用 */
export function MatchCardMobile({ match: m, label, next, provisional, seats, focus, selected, onTeamClick, timeOnly }: Props) {
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  const live = m.state === "inProgress";
  const dimmed = (focus !== null && !involves(m, focus)) || (!!selected && !involves(m, selected));
  const picked = !!selected && involves(m, selected);
  const when = m.startTime ? (timeOnly ? taipeiTime(m.startTime) : `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)}`) : "";

  // 隊伍上下（左右）位置固定：籤表依格位來源、其餘依 API 原始順序；不依比分或勝負重排
  const [left, right] = seats ?? seatsInApiOrder(m);

  return (
    <div
      onClick={clickable ? () => openGames(m.id) : undefined}
      title={clickable ? "查看小局細節" : undefined}
      className={`rounded-lg bg-panel px-3 py-2 transition-opacity ${
        provisional ? "border border-dashed border-muted/60" : live ? "border border-live" : "border border-line"
      } ${picked ? "ring-2 ring-accent" : ""} ${dimmed ? "opacity-30" : ""} ${clickable ? "cursor-pointer active:bg-panel-2" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate font-semibold">{label}</span>
        <span className="shrink-0 font-mono">
          {live ? (
            <span className="live-blink rounded bg-live px-1 font-bold text-white">● LIVE</span>
          ) : m.state === "completed" ? (
            `已結束・Bo${m.bestOf}`
          ) : (
            `${when}${when ? "・" : ""}Bo${m.bestOf}`
          )}
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamCell seat={left} align="right" selected={selected} onTeamClick={onTeamClick} />
        <span className="min-w-14 text-center font-mono text-lg font-bold tabular-nums">
          {m.state === "unstarted" ? (
            <span className="text-sm text-muted">vs</span>
          ) : (
            <SeriesScore match={m} leftIsA={!left.team || left.team.id === m.teamA?.id} />
          )}
        </span>
        <TeamCell seat={right} align="left" selected={selected} onTeamClick={onTeamClick} />
      </div>

      {next && <div className="mt-1.5 text-center text-[11px] text-muted">{next}</div>}
    </div>
  );
}

function TeamCell({
  seat: { team, result, placeholder },
  align,
  selected,
  onTeamClick,
}: {
  seat: Seat;
  align: "left" | "right";
  selected?: string | null;
  onTeamClick?: (teamId: string) => void;
}) {
  const won = result === "win";
  const lost = result === "loss";
  const isSel = !!team && team.id === selected;
  return (
    <span
      onClick={
        team && onTeamClick
          ? (e) => {
              e.stopPropagation();
              onTeamClick(team.id);
            }
          : undefined
      }
      className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "flex-row-reverse text-right" : "text-left"} ${
        lost ? "opacity-45" : ""
      } ${team && onTeamClick ? "cursor-pointer" : ""}`}
    >
      <TeamLogo team={team} size={22} />
      {team ? (
        <FitName team={team} className={`${won ? "font-bold text-win" : "font-semibold"} ${isSel ? "text-accent" : ""}`} />
      ) : (
        <span className="min-w-0 truncate text-xs text-muted">{placeholder ?? "TBD"}</span>
      )}
    </span>
  );
}

/** 顯示全名；目前寬度放不下時改用簡稱（以隱藏的量測元素比較寬度） */
function FitName({ team, className }: { team: Team; className: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setShort((probe.current?.offsetWidth ?? 0) > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [team.name]);

  return (
    <span ref={box} className="relative min-w-0 flex-1 overflow-hidden" title={team.name}>
      <span className={`block truncate ${className}`}>{short ? team.code : team.name}</span>
      <span ref={probe} aria-hidden className={`invisible absolute left-0 top-0 whitespace-nowrap ${className}`}>
        {team.name}
      </span>
    </span>
  );
}
