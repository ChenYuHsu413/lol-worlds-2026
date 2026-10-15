import type { Match, Team } from "@/lib/types";

export interface Line {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: "winner" | "loser";
  active?: boolean; // 已確定的晉級路線
}

/** 上游隊伍在目標卡片的哪一列（0 = 上、1 = 下）；API 的隊伍順序不一定照籤表上下，未知時用預設列 */
export function targetRow(team: Team | null, target: Match, fallback: 0 | 1): 0 | 1 {
  if (team && target.teamA?.id === team.id) return 0;
  if (team && target.teamB?.id === team.id) return 1;
  return fallback;
}

/** 籤表連線（直角折線） */
export function BracketLines({ lines, width, height }: { lines: Line[]; width: number; height: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
      {lines.map((l, i) => {
        const midX = (l.from.x + l.to.x) / 2;
        const d = `M ${l.from.x} ${l.from.y} H ${midX} V ${l.to.y} H ${l.to.x}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={l.kind === "winner" ? (l.active ? "var(--accent)" : "var(--line)") : "var(--muted)"}
            strokeWidth={l.active ? 2 : 1.5}
            strokeDasharray={l.kind === "loser" ? "4 4" : undefined}
            opacity={l.kind === "loser" ? 0.6 : 1}
          />
        );
      })}
    </svg>
  );
}
