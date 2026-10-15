import { useLayoutEffect, useRef, useState } from "react";
import { taipeiMonthDay, taipeiTime } from "@/lib/time";
import type { Match, Team } from "@/lib/types";
import { involves } from "./focus";
import { hasGames, useOpenGames } from "./games-context";
import { TeamLogo } from "./TeamLogo";

interface Props {
  match: Match;
  label: string; // 場次名稱，例如「勝部首輪 A」「R3・2-0 晉級戰」「八強 1」
  next?: string | null; // 第三行：晉級去向
  provisional?: boolean; // 位置推測（虛線框）
  sourceLabels?: [string, string] | null; // 隊伍未定時顯示來源，例如「八強 1 勝者」
  focus: string | null; // 隊伍篩選
  selected?: string | null; // 瑞士輪點選的隊伍（路徑高亮）
  onTeamClick?: (teamId: string) => void;
  timeOnly?: boolean; // 賽程列表已有日期標題時只顯示時間
}

/** 手機版（< 768px）共用對戰卡：Play-In、瑞士輪、淘汰賽、賽程共用 */
export function MatchCardMobile({ match: m, label, next, provisional, sourceLabels, focus, selected, onTeamClick, timeOnly }: Props) {
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  const done = m.state === "completed";
  const live = m.state === "inProgress";
  const dimmed = (focus !== null && !involves(m, focus)) || (!!selected && !involves(m, selected));
  const picked = !!selected && involves(m, selected);
  const when = m.startTime ? (timeOnly ? taipeiTime(m.startTime) : `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)}`) : "";

  const side = (which: "A" | "B") => {
    const team = which === "A" ? m.teamA : m.teamB;
    return {
      team,
      won: done && m.winner === which,
      lost: done && m.winner !== null && m.winner !== which,
      source: sourceLabels?.[which === "A" ? 0 : 1],
    };
  };

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
          ) : done ? (
            `已結束・Bo${m.bestOf}`
          ) : (
            `${when}${when ? "・" : ""}Bo${m.bestOf}`
          )}
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamCell {...side("A")} align="right" selected={selected} onTeamClick={onTeamClick} />
        <span className="w-14 text-center font-mono text-lg font-bold tabular-nums">
          {m.state === "unstarted" ? <span className="text-sm text-muted">vs</span> : `${m.scoreA} : ${m.scoreB}`}
        </span>
        <TeamCell {...side("B")} align="left" selected={selected} onTeamClick={onTeamClick} />
      </div>

      {next && <div className="mt-1.5 text-center text-[11px] text-muted">{next}</div>}
    </div>
  );
}

function TeamCell({
  team,
  won,
  lost,
  source,
  align,
  selected,
  onTeamClick,
}: {
  team: Team | null;
  won: boolean;
  lost: boolean;
  source?: string;
  align: "left" | "right";
  selected?: string | null;
  onTeamClick?: (teamId: string) => void;
}) {
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
        <span className="min-w-0 truncate text-xs text-muted">{source ?? "TBD"}</span>
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
