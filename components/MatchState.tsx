import type { MatchState as State } from "@/lib/types";

export function MatchState({ state }: { state: State }) {
  if (state === "inProgress")
    return (
      <span className="live-blink inline-flex items-center gap-1 rounded bg-live px-1.5 py-0.5 text-[11px] font-bold text-white">
        ● LIVE
      </span>
    );
  if (state === "completed") return <span className="text-xs text-muted">已結束</span>;
  return <span className="text-xs text-muted/70">未開始</span>;
}
