import { useLayoutEffect, useRef, useState } from "react";
import { SWISS } from "@/config/format-2026";
import { pendingSeats, resultCapacity, swissGrid, teamEdges, type GridNode } from "@/lib/swiss-grid";
import { taipeiMonthDay, taipeiTime } from "@/lib/time";
import type { SwissSlot, SwissView, Team } from "@/lib/types";
import { hasGames, useOpenGames } from "./games-context";
import { useSeriesResult } from "./result-context";
import { SwissMobile } from "./SwissMobile";
import { SwissTable, type SwissMode } from "./SwissTable";
import { TeamLogo } from "./TeamLogo";

const COL_MIN = 150;
const GAP_X = 28;
const GRID = swissGrid();

export function SwissBuckets({
  view,
  focus,
  mode,
  onFocus,
}: {
  view: SwissView;
  focus: string | null;
  mode: SwissMode; // 只影響桌機
  onFocus: (id: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block">
        {mode === "table" ? <SwissTable view={view} focus={focus} onFocus={onFocus} /> : <SwissDesktop view={view} focus={focus} />}
      </div>
      <div className="md:hidden">
        <SwissMobile view={view} focus={focus} />
      </div>
    </>
  );
}

// ---- 桌機（≥ 768px）：戰績網格（橫軸輪次、縱軸勝敗差），桶與桶之間畫勝/敗流向線 ----

function SwissDesktop({ view, focus }: { view: SwissView; focus: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null); // 點選後固定，再點一次取消
  const active = hover ?? pinned ?? focus;
  const onPick = (id: string) => setPinned((cur) => (cur === id ? null : id));

  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ key: string; win: boolean; d: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // 依 DOM 位置畫連線：從桶的右緣（勝線偏上、敗線偏下）到下一欄節點的左緣，只經過欄與欄之間的空隙
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const base = el.getBoundingClientRect();
      const rect = (k: string) => el.querySelector(`[data-node="${k}"]`)?.getBoundingClientRect();
      setLines(
        GRID.edges.flatMap((e) => {
          const a = rect(e.from);
          const b = rect(e.to);
          if (!a || !b) return [];
          const x1 = a.right - base.left;
          const y1 = a.top - base.top + a.height * (e.win ? 0.35 : 0.65);
          const x2 = b.left - base.left;
          const y2 = b.top - base.top + b.height / 2;
          const dx = (x2 - x1) / 2;
          return [{ key: `${e.from}>${e.to}`, win: e.win, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` }];
        }),
      );
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  if (view.slots.length === 0) return <p className="text-muted">尚無瑞士輪資料</p>;

  const path = active ? teamEdges(view, active) : null;
  const ordered = path ? [...lines].sort((a, b) => Number(path.has(a.key)) - Number(path.has(b.key))) : lines;
  const hp: HoverProps = { active, onHover: setHover, onPick };

  return (
    <div className="space-y-3">
      <Legend />
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div
          ref={box}
          className="relative grid items-center gap-y-2.5"
          style={{ gridTemplateColumns: `repeat(${GRID.cols}, minmax(${COL_MIN}px, 1fr))`, columnGap: GAP_X }}
          onMouseLeave={() => setHover(null)}
        >
          <svg className="pointer-events-none absolute left-0 top-0" width={size.w} height={size.h} aria-hidden>
            {ordered.map((l) => {
              const on = path?.has(l.key);
              return (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  stroke={on ? "var(--accent)" : l.win ? "var(--win)" : "var(--muted)"}
                  strokeOpacity={on ? 0.95 : path ? 0.12 : 0.35}
                  strokeWidth={on ? 2.5 : 1.25}
                />
              );
            })}
          </svg>
          {Array.from({ length: GRID.cols }, (_, c) => (
            <div key={c} className="text-xs font-bold text-accent" style={{ gridColumn: c + 1, gridRow: 1 }}>
              {c < GRID.cols - 1 ? `第 ${c + 1} 輪` : "最終結果"}
            </div>
          ))}
          {GRID.nodes.map((n) => (
            <div key={n.key} data-node={n.key} className="relative" style={{ gridColumn: n.col + 1, gridRow: n.row + 2 }}>
              {n.kind === "bucket" ? <Bucket node={n} view={view} {...hp} /> : <ResultBlock node={n} view={view} {...hp} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type HoverProps = { active: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void };

const bucketType = (w: number, l: number) => {
  const q = w === SWISS.winsToQualify - 1;
  const e = l === SWISS.lossesToEliminate - 1;
  return q && e ? "晉級/淘汰戰" : q ? "晉級戰" : e ? "淘汰戰" : "";
};

function Bucket({ node, view, ...hp }: { node: GridNode; view: SwissView } & HoverProps) {
  const slots = view.slots.filter((s) => s.wins === node.wins && s.losses === node.losses);
  const paired = slots.filter((s) => s.match.teamA && s.match.teamB);
  const pending = pendingSeats(view, node.wins, node.losses);
  const from = slots
    .filter((s) => !s.match.teamA || !s.match.teamB)
    .map((s) => s.match.startTime)
    .filter(Boolean)
    .sort()[0];
  const bos = [...new Set(slots.map((s) => s.match.bestOf))];
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel">
      <div className="flex justify-between gap-1 bg-panel-2 px-2 py-0.5 text-xs">
        <span className="font-mono font-bold">{node.key}</span>
        <span className="truncate text-muted">{[bucketType(node.wins, node.losses), bos.map((b) => `Bo${b}`).join("/")].filter(Boolean).join("・")}</span>
      </div>
      {paired.length > 0 && (
        <ul className="divide-y divide-line/60">
          {paired.map((s) => (
            <SlotRow key={s.match.id} slot={s} {...hp} />
          ))}
        </ul>
      )}
      {pending.teams.length + pending.open > 0 && (
        <div className="m-1 rounded border border-dashed border-muted/50 px-1.5 py-1">
          <div className="text-[10px] text-muted">
            待抽籤{from && `・${taipeiMonthDay(from)} 起`}
          </div>
          <TeamChips teams={pending.teams} open={pending.open} {...hp} />
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot: { match: m }, active, onHover, onPick }: { slot: SwissSlot } & HoverProps) {
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  const dimmed = active !== null && m.teamA?.id !== active && m.teamB?.id !== active;
  const live = m.state === "inProgress";
  const r = useSeriesResult(m);
  const side = (team: Team | null, which: "A" | "B") => {
    const score = r.kind === "pending" ? null : which === "A" ? r.scoreA : r.scoreB;
    const won = m.state === "completed" && m.winner === which;
    const lost = m.state === "completed" && m.winner !== null && m.winner !== which;
    return (
      <span
        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1 ${which === "B" ? "flex-row-reverse" : ""} ${
          team?.id === active ? "text-accent" : ""
        }`}
        onMouseEnter={() => team && onHover(team.id)}
        onClick={(e) => {
          if (!team) return;
          e.stopPropagation();
          onPick(team.id);
        }}
      >
        <TeamLogo team={team} size={16} />
        <span className={`truncate text-xs ${won ? "font-bold text-win" : lost ? "text-muted" : team ? "font-semibold" : "text-muted"}`}>
          {team?.code ?? "TBD"}
        </span>
        {m.state !== "unstarted" && score !== null && (
          <span className={`font-mono text-xs tabular-nums ${won ? "font-bold text-win" : "text-muted"}`}>{score}</span>
        )}
      </span>
    );
  };
  return (
    <li
      title={m.startTime ? `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)} (UTC+8)・Bo${m.bestOf}` : undefined}
      onClick={clickable ? () => openGames(m.id) : undefined}
      className={`flex items-center gap-1 px-1.5 py-1 transition-opacity ${live ? "bg-live/10" : ""} ${dimmed ? "opacity-25" : ""} ${clickable ? "cursor-pointer hover:bg-panel-2" : ""}`}
    >
      {side(m.teamA, "A")}
      <span className={`shrink-0 text-[10px] ${live ? "live-blink font-bold text-live" : r.kind === "official" ? "text-muted" : "text-accent-2"}`}>
        {live
          ? "LIVE"
          : r.kind === "pending"
            ? "更新中"
            : r.kind === "provisional"
              ? "暫定"
              : m.state === "unstarted"
                ? taipeiMonthDay(m.startTime)
                : "vs"}
      </span>
      {side(m.teamB, "B")}
    </li>
  );
}

function ResultBlock({ node, view, ...hp }: { node: GridNode; view: SwissView } & HoverProps) {
  const q = node.kind === "qualified";
  const teams = view.records.filter((r) => r.wins === node.wins && r.losses === node.losses).map((r) => r.team);
  const cap = resultCapacity(node.wins, node.losses);
  return (
    <div className={`rounded-md border px-2 py-1.5 ${q ? "border-win/60 bg-win-bg" : "border-loss/50 bg-loss-bg"}`}>
      <div className={`flex justify-between font-mono text-xs font-bold ${q ? "text-win" : "text-loss"}`}>
        <span>
          {node.key} {q ? "晉級" : "淘汰"}
        </span>
        <span className="font-sans font-normal text-muted">{cap} 名額</span>
      </div>
      <TeamChips teams={teams} open={Math.max(0, cap - teams.length)} {...hp} />
    </div>
  );
}

/** 隊伍 logo + 簡稱；尚未產生的名額顯示空位圈 */
function TeamChips({ teams, open, active, onHover, onPick }: { teams: Team[]; open: number } & HoverProps) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
      {teams.map((t) => (
        <button
          key={t.id}
          onMouseEnter={() => onHover(t.id)}
          onClick={() => onPick(t.id)}
          className={`flex items-center gap-1 text-xs font-semibold transition-opacity ${active && active !== t.id ? "opacity-30" : ""} ${
            active === t.id ? "text-accent" : ""
          }`}
        >
          <TeamLogo team={t} size={16} />
          {t.code}
        </button>
      ))}
      {Array.from({ length: open }, (_, i) => (
        <TeamLogo key={i} team={null} size={16} />
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>滑過或點選隊伍可顯示其晉級路徑（點選後固定，再點一次取消）</span>
      <span className="flex items-center gap-1">
        <svg width="20" height="8" aria-hidden>
          <path d="M0,6 L20,2" stroke="var(--win)" strokeOpacity={0.6} strokeWidth={1.5} />
        </svg>
        勝者往右上
      </span>
      <span className="flex items-center gap-1">
        <svg width="20" height="8" aria-hidden>
          <path d="M0,2 L20,6" stroke="var(--muted)" strokeOpacity={0.6} strokeWidth={1.5} />
        </svg>
        敗者往右下
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-5 rounded border border-dashed border-muted/60" /> 待抽籤
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
