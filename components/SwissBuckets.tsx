import { useLayoutEffect, useRef, useState } from "react";
import { SWISS } from "@/config/format-2026";
import { taipeiMonthDay, taipeiTime } from "@/lib/time";
import type { SwissRecord, SwissSlot, SwissView, Team } from "@/lib/types";
import { hasGames, useOpenGames } from "./games-context";
import { SwissMobile } from "./SwissMobile";
import { TeamLogo } from "./TeamLogo";

const COL_W = 176;
const GAP = 28;

interface Column {
  round: number | null; // null = 最終結果欄
  qualified: { label: string; teams: SwissRecord[] } | null;
  buckets: { label: string; slots: SwissSlot[] }[];
  eliminated: { label: string; teams: SwissRecord[] } | null;
}

function buildColumns(view: SwissView): Column[] {
  const maxRound = Math.max(0, ...view.slots.map((s) => s.round));
  const cols: Column[] = [];
  for (let c = 1; c <= maxRound + 1; c++) {
    // 第 c 欄開頭顯示「打完第 c-1 輪」剛晉級/淘汰的隊伍
    const ql = c - 1 - SWISS.winsToQualify;
    const ew = c - 1 - SWISS.lossesToEliminate;
    const block = (w: number, l: number, label: string) => ({
      label: `${w}-${l} ${label}`,
      teams: view.records.filter((r) => r.wins === w && r.losses === l),
    });
    const slots = view.slots.filter((s) => s.round === c);
    const groups = new Map<string, SwissSlot[]>();
    for (const s of [...slots].sort((a, b) => b.wins - a.wins || a.losses - b.losses))
      groups.set(`${s.wins}-${s.losses}`, [...(groups.get(`${s.wins}-${s.losses}`) ?? []), s]);
    cols.push({
      round: c <= maxRound ? c : null,
      qualified: ql >= 0 && ql < SWISS.lossesToEliminate ? block(SWISS.winsToQualify, ql, "晉級") : null,
      buckets: [...groups.entries()].map(([label, s]) => ({ label, slots: s })),
      eliminated: ew >= 0 && ew < SWISS.winsToQualify ? block(ew, SWISS.lossesToEliminate, "淘汰") : null,
    });
  }
  return cols;
}

export function SwissBuckets({ view, focus }: { view: SwissView; focus: string | null }) {
  return (
    <>
      <div className="hidden md:block">
        <SwissDesktop view={view} focus={focus} />
      </div>
      <div className="md:hidden">
        <SwissMobile view={view} focus={focus} />
      </div>
    </>
  );
}

// ---- 桌機（≥ 768px）：分桶欄位圖，hover 顯示路徑 ----

function SwissDesktop({ view, focus }: { view: SwissView; focus: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const active = hover ?? focus;
  const cols = buildColumns(view);
  const width = cols.length * COL_W + (cols.length - 1) * GAP;

  const box = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ points: string; size: { w: number; h: number } } | null>(null);

  // 依 DOM 位置畫出隊伍一路走過的路徑
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !active) return setPath(null);
    const base = el.getBoundingClientRect();
    const nodes = [...el.querySelectorAll<HTMLElement>(`[data-team~="${active}"]`)].sort(
      (a, b) => Number(a.dataset.col) - Number(b.dataset.col),
    );
    const pts = nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return `${r.left - base.left + r.width / 2},${r.top - base.top + r.height / 2}`;
    });
    setPath(pts.length > 1 ? { points: pts.join(" "), size: { w: base.width, h: base.height } } : null);
  }, [active, view]);

  if (view.slots.length === 0) return <p className="text-muted">尚無瑞士輪資料</p>;

  return (
    <div className="space-y-3">
      <Legend />
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div ref={box} className="relative flex items-start" style={{ width, gap: GAP }} onMouseLeave={() => setHover(null)}>
          {path && (
            <svg className="pointer-events-none absolute inset-0 z-10" width={path.size.w} height={path.size.h} aria-hidden>
              <polyline points={path.points} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeOpacity={0.75} strokeLinejoin="round" />
            </svg>
          )}
          {cols.map((col, ci) => (
            <div key={ci} className="flex shrink-0 flex-col gap-3" style={{ width: COL_W }}>
              <div className="text-xs font-bold text-accent">{col.round ? `第 ${col.round} 輪` : "最終結果"}</div>
              {col.qualified && <ResultBlock {...col.qualified} kind="qualified" col={ci} active={active} onHover={setHover} />}
              {col.buckets.map((b) => (
                <Bucket key={b.label} label={b.label} slots={b.slots} col={ci} active={active} onHover={setHover} />
              ))}
              {col.eliminated && <ResultBlock {...col.eliminated} kind="eliminated" col={ci} active={active} onHover={setHover} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type HoverProps = { col: number; active: string | null; onHover: (id: string | null) => void };

function Bucket({ label, slots, col, active, onHover }: { label: string; slots: SwissSlot[] } & HoverProps) {
  const bos = [...new Set(slots.map((s) => s.match.bestOf))];
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel">
      <div className="flex justify-between bg-panel-2 px-2 py-0.5 text-xs">
        <span className="font-mono font-bold">{label}</span>
        <span className="text-muted">{bos.map((b) => `Bo${b}`).join("/")}</span>
      </div>
      <ul className="divide-y divide-line/60">
        {slots.map((s) => (
          <SlotRow key={s.match.id} slot={s} col={col} active={active} onHover={onHover} />
        ))}
      </ul>
    </div>
  );
}

function SlotRow({ slot: { match: m, provisional }, col, active, onHover }: { slot: SwissSlot } & HoverProps) {
  const ids = [m.teamA?.id, m.teamB?.id].filter(Boolean).join(" ");
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  const dimmed = active !== null && !ids.split(" ").includes(active);
  const live = m.state === "inProgress";
  const side = (team: Team | null, score: number, which: "A" | "B") => {
    const won = m.state === "completed" && m.winner === which;
    const lost = m.state === "completed" && m.winner !== null && m.winner !== which;
    return (
      <span
        className={`flex min-w-0 flex-1 items-center gap-1 ${which === "B" ? "flex-row-reverse" : ""} ${
          team?.id === active ? "text-accent" : ""
        }`}
        onMouseEnter={() => team && onHover(team.id)}
      >
        <TeamLogo team={team} size={16} />
        <span className={`truncate text-xs ${won ? "font-bold text-win" : lost ? "text-muted" : team ? "font-semibold" : "text-muted"}`}>
          {team?.code ?? "TBD"}
        </span>
        {m.state !== "unstarted" && (
          <span className={`font-mono text-xs tabular-nums ${won ? "font-bold text-win" : "text-muted"}`}>{score}</span>
        )}
      </span>
    );
  };
  return (
    <li
      data-team={ids}
      data-col={col}
      title={m.startTime ? `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)} (UTC+8)・Bo${m.bestOf}` : undefined}
      onClick={clickable ? () => openGames(m.id) : undefined}
      className={`flex items-center gap-1 px-1.5 py-1 transition-opacity ${provisional ? "m-1 rounded border border-dashed border-muted/50" : ""} ${live ? "bg-live/10" : ""} ${dimmed ? "opacity-25" : ""} ${clickable ? "cursor-pointer hover:bg-panel-2" : ""}`}
    >
      {side(m.teamA, m.scoreA, "A")}
      <span className={`shrink-0 text-[10px] ${live ? "live-blink font-bold text-live" : "text-muted"}`}>
        {live ? "LIVE" : provisional ? taipeiMonthDay(m.startTime) : "vs"}
      </span>
      {side(m.teamB, m.scoreB, "B")}
    </li>
  );
}

function ResultBlock({
  label,
  teams,
  kind,
  col,
  active,
  onHover,
}: { label: string; teams: SwissRecord[]; kind: "qualified" | "eliminated" } & HoverProps) {
  const q = kind === "qualified";
  return (
    <div className={`rounded-md border px-2 py-1.5 ${q ? "border-win/60 bg-win-bg" : "border-loss/50 bg-loss-bg"}`}>
      <div className={`mb-1 font-mono text-xs font-bold ${q ? "text-win" : "text-loss"}`}>{label}</div>
      {teams.length === 0 ? (
        <div className="text-xs text-muted">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {teams.map((r) => (
            <span
              key={r.team.id}
              data-team={r.team.id}
              data-col={col}
              onMouseEnter={() => onHover(r.team.id)}
              className={`flex items-center gap-1 text-xs font-semibold transition-opacity ${
                active && active !== r.team.id ? "opacity-30" : ""
              } ${active === r.team.id ? "text-accent" : ""}`}
            >
              <TeamLogo team={r.team} size={16} />
              {r.team.code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>滑過隊伍可顯示其晉級路徑</span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-5 rounded border border-dashed border-muted/60" /> 隊伍未定（位置依賽程推測）
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-5 rounded border border-win/60 bg-win-bg" /> 晉級
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-5 rounded border border-loss/50 bg-loss-bg" /> 淘汰
      </span>
    </div>
  );
}
