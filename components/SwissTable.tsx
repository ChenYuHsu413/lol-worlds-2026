import { useEffect, useState } from "react";
import { swissTable, TIEBREAK_NOTE, type TableCell } from "@/lib/swiss-table";
import type { SwissView } from "@/lib/types";
import { hasGames, useOpenGames } from "./games-context";
import { useSeriesResult } from "./result-context";
import { TeamLogo } from "./TeamLogo";

export type SwissMode = "bracket" | "table";
const MODE_KEY = "worlds:swissMode";

/** 桌機瑞士輪的「對戰圖 / 戰績表」選擇，存在 localStorage；掛載後才讀，避免 hydration 不一致 */
export function useSwissMode(): [SwissMode, (m: SwissMode) => void] {
  const [mode, setMode] = useState<SwissMode>("bracket");
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === "table") setMode("table");
    } catch {}
  }, []);
  const set = (m: SwissMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };
  return [mode, set];
}

export function SwissModeToggle({ mode, onChange }: { mode: SwissMode; onChange: (m: SwissMode) => void }) {
  return (
    <div className="mb-3 hidden w-fit overflow-hidden rounded-lg border border-line text-sm md:flex" role="group" aria-label="瑞士輪呈現方式">
      {(
        [
          ["bracket", "對戰圖"],
          ["table", "戰績表"],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`px-4 py-1.5 font-semibold ${mode === m ? "bg-accent text-bg" : "bg-panel text-muted hover:text-fg"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const STATUS = {
  qualified: { label: "晉級", row: "bg-win-bg", badge: "border-win/60 text-win" },
  eliminated: { label: "淘汰", row: "bg-loss-bg", badge: "border-loss/50 text-muted" },
  alive: { label: "進行中", row: "", badge: "border-line text-muted" },
} as const;

/** 桌機（≥ 768px）戰績表：一列一隊；點對手開小局面板、點隊名套用隊伍篩選 */
export function SwissTable({ view, focus, onFocus }: { view: SwissView; focus: string | null; onFocus: (id: string) => void }) {
  const rows = swissTable(view);
  if (rows.length === 0) return <p className="text-muted">尚無瑞士輪資料</p>;
  const rounds = rows[0].rounds.length;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">隊伍</th>
              {Array.from({ length: rounds }, (_, i) => (
                <th key={i} className="w-28 px-2 py-2 text-left font-semibold">
                  R{i + 1}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-semibold">戰績</th>
              <th className="px-3 py-2 text-center font-semibold">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.team.id} className={`${s.row} ${focus === r.team.id ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}>
                  <td className="px-3 py-1.5">
                    <button onClick={() => onFocus(r.team.id)} className="flex items-center gap-2 text-left" title="套用隊伍篩選">
                      <TeamLogo team={r.team} size={24} />
                      <span className="font-semibold hover:text-accent">{r.team.name}</span>
                      {r.team.league && <span className="text-xs text-muted">{r.team.league}</span>}
                    </button>
                  </td>
                  {r.rounds.map((c, i) => (
                    <td key={i} className="px-2 py-1.5">
                      {c && <Cell cell={c} />}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-center font-mono font-bold tabular-nums">
                    {r.wins}-{r.losses}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${s.badge}`}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{TIEBREAK_NOTE}</p>
    </div>
  );
}

function Cell({ cell: c }: { cell: TableCell }) {
  const openGames = useOpenGames();
  const r = useSeriesResult(c.match);
  const tone = c.live
    ? "bg-live/10 text-live"
    : c.pending
      ? "bg-panel-2 text-accent-2"
      : c.result === "win"
        ? "bg-win-bg text-win"
        : "bg-loss-bg text-muted";
  const mine = c.match.teamA?.id === c.opponent?.id ? "B" : "A";
  return (
    <button
      onClick={hasGames(c.match) ? () => openGames(c.match.id) : undefined}
      title={`vs ${c.opponent?.name ?? "TBD"}・查看小局細節`}
      className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-xs font-bold ${tone}`}
    >
      <TeamLogo team={c.opponent} size={18} />
      {c.live ? (
        <span className="live-blink">LIVE</span>
      ) : c.pending ? (
        r.kind === "provisional" ? (
          <span className="font-normal">
            暫定 {mine === "A" ? `${r.scoreA}-${r.scoreB}` : `${r.scoreB}-${r.scoreA}`}
          </span>
        ) : (
          <span className="font-normal">更新中</span>
        )
      ) : c.result === "win" ? (
        "勝"
      ) : (
        "敗"
      )}
      {c.score && <span className="font-mono font-normal tabular-nums">{c.score.join("-")}</span>}
    </button>
  );
}
