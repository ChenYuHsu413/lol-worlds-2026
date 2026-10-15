import { taipeiDateKey, taipeiDayHeading, taipeiTime, TZ_LABEL } from "@/lib/time";
import type { Match } from "@/lib/types";
import { MatchState } from "./MatchState";
import { TeamLogo, TeamName } from "./TeamLogo";
import { involves } from "./focus";

const STAGE_LABEL = { playin: "入圍賽", swiss: "瑞士輪", knockout: "淘汰賽" } as const;

export function ScheduleList({
  matches,
  focus,
  highlight = null,
}: {
  matches: Match[];
  focus: string | null;
  highlight?: string | null; // 從隊伍頁跳過來的場次
}) {
  const sorted = matches.filter((m) => m.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const days = new Map<string, Match[]>();
  for (const m of sorted) {
    const k = taipeiDateKey(m.startTime);
    days.set(k, [...(days.get(k) ?? []), m]);
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">所有時間為台灣時間 {TZ_LABEL}</p>
      {[...days.entries()].map(([day, ms]) => (
        <section key={day}>
          <h3 className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 py-2 text-sm font-bold text-accent backdrop-blur">
            {taipeiDayHeading(ms[0].startTime)}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {ms.map((m) => (
              <ScheduleRow
                key={m.id}
                match={m}
                dimmed={focus !== null && !involves(m, focus)}
                highlighted={m.id === highlight}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ScheduleRow({ match: m, dimmed, highlighted }: { match: Match; dimmed: boolean; highlighted: boolean }) {
  const done = m.state === "completed";
  const side = (which: "A" | "B") => {
    const team = which === "A" ? m.teamA : m.teamB;
    const lost = done && m.winner !== null && m.winner !== which;
    return { team, lost };
  };
  const a = side("A");
  const b = side("B");
  return (
    <li
      id={`match-${m.id}`}
      className={`${highlighted ? "bg-accent/15 ring-2 ring-inset ring-accent" : ""} grid grid-cols-[3.5rem_1fr] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition-opacity sm:grid-cols-[3.5rem_7rem_1fr_5rem] ${dimmed ? "opacity-30" : ""}`}
    >
      <div className="font-mono tabular-nums text-muted">
        {taipeiTime(m.startTime)}
        <div className="text-[10px] leading-tight">{TZ_LABEL}</div>
      </div>
      <div className="col-start-2 row-start-2 text-xs text-muted sm:col-start-auto sm:row-start-auto">
        {STAGE_LABEL[m.stage]}・{m.blockName === STAGE_LABEL[m.stage] ? "" : `${m.blockName}・`}Bo{m.bestOf}
      </div>
      <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-center gap-2 sm:col-start-auto sm:row-start-auto">
        <span className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 ${a.lost ? "opacity-50" : ""}`}>
          <TeamName team={a.team} />
          <TeamLogo team={a.team} />
        </span>
        <span className="w-14 shrink-0 text-center font-mono text-base font-bold tabular-nums">
          {m.state === "unstarted" ? <span className="text-muted">vs</span> : `${m.scoreA} : ${m.scoreB}`}
        </span>
        <span className={`flex min-w-0 flex-1 items-center gap-1.5 ${b.lost ? "opacity-50" : ""}`}>
          <TeamLogo team={b.team} />
          <TeamName team={b.team} />
        </span>
      </div>
      <div className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto sm:text-right">
        <MatchState state={m.state} />
      </div>
    </li>
  );
}
