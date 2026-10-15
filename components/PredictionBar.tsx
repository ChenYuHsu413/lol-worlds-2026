import { emptyPrediction, encodePrediction, redraw, type PredictionState, type SimResult } from "@/lib/simulate";
import type { Match } from "@/lib/types";
import { TeamLogo } from "./TeamLogo";

const label = (m: Match | undefined) => (m ? `${m.teamA?.code ?? "TBD"} vs ${m.teamB?.code ?? "TBD"}` : "");

/** 預測模式工具列：命中率、預測冠軍、覆蓋通知、重設/重新抽籤/手動配對/分享 */
export function PredictionBar({
  sim,
  state,
  matches,
  swapMode,
  onSwapMode,
  onUpdate,
  onOpen,
  onToast,
}: {
  sim: SimResult;
  state: PredictionState;
  matches: Match[];
  swapMode: boolean;
  onSwapMode: (on: boolean) => void;
  onUpdate: (s: PredictionState) => void;
  onOpen: (matchId: string) => void;
  onToast: (msg: string) => void;
}) {
  const { correct, total } = sim.hits;
  const picks = Object.keys(state.picks).length;

  const share = async () => {
    const url = `${location.origin}${location.pathname}${location.search}#p=${await encodePrediction(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast("已複製分享連結");
    } catch {
      window.prompt("複製這個分享連結：", url);
    }
  };

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-bold text-accent">我的預測</span>
        <span className="text-muted">已預測 {picks} 場</span>
        <span>
          命中率{" "}
          <strong>{total ? `${correct}/${total}（${Math.round((correct / total) * 100)}%）` : "—"}</strong>
        </span>
        {sim.champion && (
          <span className="flex items-center gap-1.5 rounded border border-accent bg-accent/15 px-2 py-0.5 font-bold text-accent">
            🏆 預測冠軍 <TeamLogo team={sim.champion} size={18} /> {sim.champion.code}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => onSwapMode(!swapMode)}
            aria-pressed={swapMode}
            className={`rounded border px-2 py-1 ${swapMode ? "border-accent bg-accent text-bg" : "border-line"}`}
          >
            {swapMode ? "完成調整" : "調整配對/排籤"}
          </button>
          <button onClick={() => onUpdate(redraw(state))} className="rounded border border-line px-2 py-1">
            重新抽籤
          </button>
          <button onClick={share} className="rounded border border-line px-2 py-1">
            分享預測
          </button>
          <button
            onClick={() => {
              if (window.confirm("確定清除所有預測？")) onUpdate(emptyPrediction());
            }}
            className="rounded border border-line px-2 py-1 text-live"
          >
            重設預測
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {swapMode
          ? "調整模式：依序點兩支隊伍即可交換（瑞士輪需同輪同戰績；八強需符合 3-0 對 3-2 的種子規則）。桌機也可拖曳。"
          : "點選尚未開打的比賽即可預測勝隊；瑞士輪後續配對與八強籤表為模擬抽籤，不是官方結果。"}
      </p>
      {sim.overridden.length > 0 && (
        <div className="rounded border border-live/40 bg-live/10 px-2 py-1.5 text-xs">
          <span className="text-live">{sim.overridden.length} 場預測已被實際結果覆蓋（仍計入命中率）：</span>
          {sim.overridden.slice(0, 6).map((id) => (
            <button key={id} onClick={() => onOpen(id)} className="ml-2 underline underline-offset-2">
              {label(matches.find((m) => m.id === id))}
            </button>
          ))}
          {sim.overridden.length > 6 && <span className="ml-2 text-muted">等</span>}
        </div>
      )}
      {sim.notes.length > 0 && <p className="text-xs text-muted">{sim.notes.join("；")}</p>}
    </div>
  );
}
