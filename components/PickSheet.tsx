import type { Pick } from "@/lib/simulate";
import { taipeiMonthDay, taipeiTime, TZ_LABEL } from "@/lib/time";
import type { Match, Team } from "@/lib/types";
import { TeamLogo } from "./TeamLogo";

/** 預測面板（固定在畫面底部，手機也好點） */
export function PickSheet({
  match: m,
  pick,
  overridden,
  onPick,
  onClear,
  onClose,
}: {
  match: Match;
  pick: Pick | undefined;
  overridden: boolean;
  onPick: (pick: Pick) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const need = Math.ceil((m.bestOf || 1) / 2);
  const scores = need > 1 ? Array.from({ length: need }, (_, l) => [need, l] as [number, number]) : [];
  const locked = m.state === "completed" && !m.sim?.result;
  const chosen = pick?.w ?? null;

  const teamButton = (t: Team) => (
    <button
      key={t.id}
      disabled={locked}
      onClick={() => onPick({ w: t.id, s: chosen === t.id ? pick?.s : undefined })}
      className={`flex flex-1 flex-col items-center gap-1 rounded-lg border-2 p-3 transition-colors disabled:opacity-60 ${
        chosen === t.id ? "border-accent bg-accent/15" : "border-line bg-panel-2"
      }`}
    >
      <TeamLogo team={t} size={36} />
      <span className="font-bold">{t.code}</span>
    </button>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel/95 p-4 shadow-2xl backdrop-blur" role="dialog" aria-label="預測勝隊">
      <div className="mx-auto max-w-md space-y-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {m.blockName}・Bo{m.bestOf}・{m.startTime && `${taipeiMonthDay(m.startTime)} ${taipeiTime(m.startTime)} ${TZ_LABEL}`}
          </span>
          <button onClick={onClose} className="px-2 text-base" aria-label="關閉">
            ✕
          </button>
        </div>
        {overridden && <p className="rounded bg-live/10 px-2 py-1 text-xs text-live">你先前的預測已被實際結果覆蓋</p>}
        {locked ? (
          <p className="text-sm">此場已完賽，鎖定為實際結果。</p>
        ) : (
          <p className="text-sm">選擇勝隊{scores.length > 0 && "，可再選比分"}：</p>
        )}
        <div className="flex gap-3">{[m.teamA, m.teamB].filter((t): t is Team => t !== null).map(teamButton)}</div>
        {!locked && chosen && scores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {scores.map((s) => (
              <button
                key={s.join("-")}
                onClick={() => onPick({ w: chosen, s })}
                className={`rounded border px-3 py-1.5 font-mono text-sm ${
                  pick?.s?.[0] === s[0] && pick?.s?.[1] === s[1] ? "border-accent text-accent" : "border-line"
                }`}
              >
                {s[0]}-{s[1]}
              </button>
            ))}
          </div>
        )}
        {!locked && chosen && (
          <button onClick={onClear} className="text-xs text-muted underline underline-offset-2">
            清除此場預測
          </button>
        )}
      </div>
    </div>
  );
}
