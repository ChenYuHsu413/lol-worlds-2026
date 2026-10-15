import { useState } from "react";
import { SWISS } from "@/config/format-2026";
import type { SwissRecord, SwissSlot, SwissView, Team } from "@/lib/types";
import { MatchCardMobile } from "./MatchCardMobile";
import { TeamLogo } from "./TeamLogo";

const bucketType = (w: number, l: number) => {
  const q = w === SWISS.winsToQualify - 1;
  const e = l === SWISS.lossesToEliminate - 1;
  return q && e ? "晉級/淘汰戰" : q ? "晉級戰" : e ? "淘汰戰" : "";
};
const after = (w: number, l: number) => (w >= SWISS.winsToQualify ? "晉級" : l >= SWISS.lossesToEliminate ? "淘汰" : `${w}-${l}`);

/** 手機（< 768px）瑞士輪：晉級/淘汰列、輪次切換、依戰績桶分段；點隊伍保留路徑高亮 */
export function SwissMobile({ view, focus }: { view: SwissView; focus: string | null }) {
  const rounds = [...new Set(view.slots.map((s) => s.round))].sort((a, b) => a - b);
  // 預設停在進行中的輪次：第一個還有未完賽場次的輪次
  const ongoing = rounds.find((r) => view.slots.some((s) => s.round === r && s.match.state !== "completed"));
  const current = ongoing ?? rounds.at(-1) ?? 1;
  const [round, setRound] = useState(current);
  const [selected, setSelected] = useState<string | null>(null);

  if (view.slots.length === 0) return <p className="text-muted">尚無瑞士輪資料</p>;

  const slots = view.slots.filter((s) => s.round === round);
  const buckets = new Map<string, SwissSlot[]>();
  for (const s of [...slots].sort((a, b) => b.wins - a.wins || a.losses - b.losses))
    buckets.set(`${s.wins}-${s.losses}`, [...(buckets.get(`${s.wins}-${s.losses}`) ?? []), s]);

  const toggle = (id: string) => setSelected((cur) => (cur === id ? null : id));
  const selectedTeam = selected ? view.records.find((r) => r.team.id === selected) : undefined;

  return (
    <div className="space-y-4">
      <ResultRow title="晉級" tone="win" records={view.records.filter((r) => r.status === "qualified")} onPick={toggle} />
      <ResultRow title="淘汰" tone="loss" records={view.records.filter((r) => r.status === "eliminated")} onPick={toggle} />

      <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-line text-sm" role="group" aria-label="輪次">
        {rounds.map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            aria-pressed={round === r}
            className={`relative py-1.5 font-semibold ${round === r ? "bg-accent text-bg" : "bg-panel text-muted"}`}
          >
            R{r}
            {r === ongoing && round !== r && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-live" />}
          </button>
        ))}
      </div>

      {selected && (
        <PathSummary team={selectedTeam?.team ?? null} slots={view.slots} teamId={selected} onClear={() => setSelected(null)} />
      )}
      {!selected && <p className="text-[11px] text-muted">點選隊伍可在各輪次標示它的場次</p>}

      {[...buckets.entries()].map(([key, bs]) => {
        const [w, l] = key.split("-").map(Number);
        const type = bucketType(w, l);
        const bos = [...new Set(bs.map((s) => s.match.bestOf))].map((b) => `Bo${b}`).join("/");
        return (
          <section key={key}>
            <h3 className="text-sm font-bold">
              <span className="font-mono">{key}</span>
              <span className="ml-1 text-xs font-normal text-muted">（{[type, bos].filter(Boolean).join("・")}）</span>
            </h3>
            <p className="mb-1.5 text-[11px] text-muted">
              勝 → {after(w + 1, l)}・敗 → {after(w, l + 1)}
            </p>
            <div className="space-y-2">
              {bs.map((s) => (
                <MatchCardMobile
                  key={s.match.id}
                  match={s.match}
                  label={`R${s.round}・${key}${type ? ` ${type}` : ""}`}
                  provisional={s.provisional}
                  focus={focus}
                  selected={selected}
                  onTeamClick={toggle}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ResultRow({
  title,
  tone,
  records,
  onPick,
}: {
  title: string;
  tone: "win" | "loss";
  records: SwissRecord[];
  onPick: (id: string) => void;
}) {
  const sorted = [...records].sort((a, b) => (tone === "win" ? a.losses - b.losses : b.wins - a.wins));
  const empty = Math.max(0, SWISS.teams / 2 - sorted.length);
  return (
    <div className="flex items-center gap-2">
      <span className={`w-8 shrink-0 text-xs font-bold ${tone === "win" ? "text-win" : "text-loss"}`}>{title}</span>
      <div className="grid flex-1 grid-cols-8 gap-1">
        {sorted.map((r) => (
          <button
            key={r.team.id}
            onClick={() => onPick(r.team.id)}
            className="flex flex-col items-center"
            title={`${r.team.name} ${r.wins}-${r.losses}`}
          >
            <TeamLogo team={r.team} size={26} />
            <span className="font-mono text-[9px] text-muted">
              {r.wins}-{r.losses}
            </span>
          </button>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <span key={i} className="flex flex-col items-center">
            <span className="h-[26px] w-[26px] rounded-md border border-dashed border-line" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}

function PathSummary({ team, slots, teamId, onClear }: { team: Team | null; slots: SwissSlot[]; teamId: string; onClear: () => void }) {
  const mine = slots
    .filter((s) => s.match.teamA?.id === teamId || s.match.teamB?.id === teamId)
    .sort((a, b) => a.round - b.round);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-2 py-1.5 text-xs">
      <TeamLogo team={team} size={18} />
      <span className="flex min-w-0 flex-1 flex-wrap gap-x-1.5">
        <strong>{team?.code}</strong>
        {mine.map((s) => {
          const opp = s.match.teamA?.id === teamId ? s.match.teamB : s.match.teamA;
          const isA = s.match.teamA?.id === teamId;
          const res = s.match.state !== "completed" ? "待賽" : (s.match.winner === "A") === isA ? "勝" : "敗";
          return (
            <span key={s.match.id} className="whitespace-nowrap">
              R{s.round} {res} {opp?.code ?? "TBD"}
            </span>
          );
        })}
      </span>
      <button onClick={onClear} className="shrink-0 px-1 text-muted" aria-label="取消選取">
        ✕
      </button>
    </div>
  );
}
