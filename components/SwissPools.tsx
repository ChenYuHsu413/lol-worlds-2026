import { useEffect, useState } from "react";
import { POOL_SOURCES, SWISS_DRAW_RULES, SWISS_R1_POOL_PAIRS } from "@/config/format-2026";
import type { SwissDrawView, Team } from "@/lib/types";
import { seedLabel, TeamLogo } from "./TeamLogo";

// 第一輪對戰組合的配色（同一組兩隊同色）
const PAIR_COLORS = [
  "bg-sky-500/20 text-sky-300 border-sky-500/60",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/60",
  "bg-amber-500/20 text-amber-300 border-amber-500/60",
  "bg-rose-500/20 text-rose-300 border-rose-500/60",
  "bg-violet-500/20 text-violet-300 border-violet-500/60",
  "bg-lime-500/20 text-lime-300 border-lime-500/60",
  "bg-orange-500/20 text-orange-300 border-orange-500/60",
  "bg-cyan-500/20 text-cyan-300 border-cyan-500/60",
];

/** 瑞士輪「分池與抽籤規則」區塊：桌機預設展開、手機預設收合 */
export function SwissPools({ draw, teams }: { draw: SwissDrawView; teams: Team[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.matchMedia("(min-width: 768px)").matches);
    } catch {}
  }, []);

  // 資料有誤時也在瀏覽器 console 提示（伺服器端已 warn）
  useEffect(() => {
    if (draw.issues?.length) console.warn("[worlds] 瑞士輪第一輪配對與抽籤規則不符", draw.issues);
  }, [draw.issues]);

  if (draw.pools.length === 0) return null;

  const code = (id: string) => teams.find((t) => t.id === id)?.code ?? "?";
  const pairOf = new Map<string, { index: number; opponent: string }>();
  draw.round1.forEach(([a, b], i) => {
    pairOf.set(a, { index: i, opponent: b });
    pairOf.set(b, { index: i, opponent: a });
  });

  return (
    <section className="mb-4 rounded-lg border border-line bg-panel">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-bold"
      >
        <span>
          分池與抽籤規則
          <span className="ml-2 text-xs font-normal text-muted">
            第一輪：{SWISS_R1_POOL_PAIRS.map(([a, b]) => `第 ${a} 池對第 ${b} 池`).join("、")}
          </span>
        </span>
        <span className="text-muted" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {draw.pools.map(({ pool, seats }) => (
              <div key={pool}>
                <h4 className="mb-1.5 text-xs font-bold text-accent">
                  第 {pool} 池 <span className="font-normal text-muted">（Tier {pool}）</span>
                </h4>
                <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
                  {seats.map((s, i) => {
                    if (!s.team)
                      return (
                        <li key={`ph-${i}`} className="flex h-full items-center gap-2 rounded border border-dashed border-muted/60 px-2 py-1.5 text-xs text-muted">
                          <span className="inline-block h-6 w-6 shrink-0 rounded-full border border-dashed border-line" aria-hidden />
                          {s.placeholder}
                        </li>
                      );
                    const pair = pairOf.get(s.team.id);
                    return (
                      <li key={s.team.id} className="flex items-center gap-2 rounded border border-line bg-panel-2 px-2 py-1.5">
                        <TeamLogo team={s.team} size={24} />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-sm font-semibold" title={s.team.name}>
                            {s.team.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted">{seedLabel(s.team) || s.team.region}</span>
                        </span>
                        {pair && (
                          <span
                            className={`shrink-0 rounded border px-1 text-[10px] font-bold ${PAIR_COLORS[pair.index % PAIR_COLORS.length]}`}
                            title={`第一輪對手：${code(pair.opponent)}`}
                          >
                            R1-{pair.index + 1} vs {code(pair.opponent)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="text-sm">
            {draw.issues === null ? (
              <p className="text-xs text-muted">第一輪抽籤尚未公布，公布後會在上方以同色標籤標示對戰組合。</p>
            ) : draw.issues.length === 0 ? (
              <p className="font-semibold text-win">✓ 第一輪配對符合分池規則</p>
            ) : (
              <div className="rounded border border-live/50 bg-live/10 p-2 text-xs">
                <p className="font-semibold text-live">第一輪配對與分池規則不符（可能是資料有誤）：</p>
                <ul className="ml-4 list-disc">
                  {draw.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-1 text-xs font-bold text-muted">抽籤規則</h4>
            <ul className="ml-4 list-disc space-y-0.5 text-xs">
              {SWISS_DRAW_RULES.map((r) => (
                <li key={r.text}>
                  {r.text}
                  <a href={r.source.url} target="_blank" rel="noreferrer" className="ml-1 text-accent-2 underline underline-offset-2">
                    出處
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              分池出處：
              {POOL_SOURCES.map((s, i) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-2">
                  {s.title}
                  {i < POOL_SOURCES.length - 1 ? "、" : ""}
                </a>
              ))}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
