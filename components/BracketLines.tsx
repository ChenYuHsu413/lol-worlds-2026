export interface Line {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: "winner" | "loser";
  active?: boolean; // 已確定的晉級路線
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
