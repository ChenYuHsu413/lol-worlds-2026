"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decodePrediction,
  emptyPrediction,
  prune,
  setPick,
  simulate,
  swapKo,
  swapSwiss,
  type PredictionState,
} from "@/lib/simulate";
import { taipeiDateTime, TZ_LABEL } from "@/lib/time";
import type { Stage, WorldsData, WorldsPayload } from "@/lib/types";
import { buildStageViews } from "@/lib/views";
import { KnockoutBracket } from "./KnockoutBracket";
import { PickSheet } from "./PickSheet";
import { PredictionBar } from "./PredictionBar";
import { loadStoredPrediction, PredictContext, storePrediction, type PredictCtx } from "./predict";
import { PlayInBracket } from "./PlayInBracket";
import { ScheduleList } from "./ScheduleList";
import { SwissBuckets } from "./SwissBuckets";
import { TeamsView } from "./TeamsView";

type Tab = Stage | "schedule" | "teams";
const TABS: { key: Tab; label: string }[] = [
  { key: "playin", label: "Play-In" },
  { key: "swiss", label: "瑞士輪" },
  { key: "knockout", label: "淘汰賽" },
  { key: "schedule", label: "全部賽程" },
  { key: "teams", label: "參賽隊伍" },
];

const CACHE_KEY = "worlds:last";

export function WorldsApp({ initial, fixture }: { initial: WorldsPayload; fixture: string | null }) {
  const [payload, setPayload] = useState(initial);
  const [tab, setTab] = useState<Tab>(initial.data?.currentStage ?? "schedule");
  const [focus, setFocus] = useState<string | null>(null);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const { data, error } = payload;

  // ---- 預測模式 ----
  const [mode, setMode] = useState<"actual" | "predict">("actual");
  const [pstate, setPstate] = useState<PredictionState | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [swapSel, setSwapSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 分享連結（#p=...）優先，其次 localStorage
  useEffect(() => {
    (async () => {
      const m = location.hash.match(/^#p=([A-Za-z0-9_-]+)$/);
      if (m) {
        const shared = await decodePrediction(m[1]);
        if (shared) {
          setPstate(shared);
          storePrediction(shared);
          setMode("predict");
          return;
        }
        setToast("分享連結無法解析，已載入你自己的預測");
      }
      setPstate(loadStoredPrediction() ?? emptyPrediction());
    })();
  }, []);

  const update = useCallback((next: PredictionState) => {
    setPstate(next);
    storePrediction(next);
    // 編輯後網址上的分享內容已不是目前狀態
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }, []);

  const sim = useMemo(
    () => (mode === "predict" && data && pstate ? simulate(data.matches, data.profiles, pstate) : null),
    [mode, data, pstate],
  );
  const view: WorldsData | null = useMemo(
    () => (sim && data ? { ...data, matches: sim.matches, ...buildStageViews(sim.matches, () => {}) } : data),
    [sim, data],
  );

  // 因使用者改了上游預測而對不上隊伍的預測，自動移除
  useEffect(() => {
    if (sim?.stale.length && pstate) update(prune(pstate, sim.stale));
  }, [sim, pstate, update]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const predictCtx: PredictCtx = {
    enabled: mode === "predict",
    sim,
    open: setOpenId,
    swapMode,
    swapSelected: swapSel,
    swap: (scope, a, b, round) => {
      if (!sim || !pstate || a === b) return;
      const next = scope === "swiss" && round !== undefined ? swapSwiss(pstate, sim, round, a, b) : swapKo(pstate, sim, a, b);
      if (next) update(next);
      else setToast(scope === "swiss" ? "無法交換：需同輪同戰績，且不得重複交手" : "無法交換：3-0 隊伍需在兩側種子位、對手為 3-2");
      setSwapSel(null);
    },
    swapClick: (scope, teamId, round) => {
      if (!swapSel) return setSwapSel(teamId);
      if (swapSel === teamId) return setSwapSel(null);
      predictCtx.swap(scope, swapSel, teamId, round);
    },
  };
  const openMatch = openId ? sim?.matches.find((m) => m.id === openId) : undefined;

  // 從隊伍頁點場次：切到賽程列表並捲到該場
  const jump = (matchId: string) => {
    setTab("schedule");
    setJumpTo(matchId);
  };
  useEffect(() => {
    if (tab !== "schedule" || !jumpTo) return;
    // 等切換 Tab 後的版面完成再捲動
    const id = setTimeout(() => document.getElementById(`match-${jumpTo}`)?.scrollIntoView({ block: "center" }));
    return () => clearTimeout(id);
  }, [tab, jumpTo]);

  // 伺服器端也沒有資料時，退回瀏覽器上次成功的資料
  useEffect(() => {
    if (initial.data || fixture) return;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setPayload((p) => ({ ...p, data: JSON.parse(cached) }));
    } catch {}
  }, [initial.data, fixture]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/worlds${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ""}`);
      const next: WorldsPayload = await res.json();
      setPayload((prev) => ({ data: next.data ?? prev.data, error: next.error }));
    } catch {
      setPayload((prev) => ({ ...prev, error: { kind: "network", message: "無法連線到伺服器" } }));
    }
  }, [fixture]);

  useEffect(() => {
    if (data && !fixture && !error) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {}
    }
  }, [data, fixture, error]);

  const interval = (data?.revalidateSeconds ?? 60) * 1000;
  useEffect(() => {
    const id = setInterval(refresh, interval);
    return () => clearInterval(id);
  }, [refresh, interval]);

  return (
    <div className={`mx-auto w-full max-w-6xl px-4 ${openMatch ? "pb-72" : "pb-16"}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
        <h1 className="text-xl font-black tracking-wide">
          <span className="text-accent">WORLDS</span> 2026
        </h1>
        <div className="text-xs text-muted">
          {data ? `最後更新 ${taipeiDateTime(data.fetchedAt)} ${TZ_LABEL}` : "尚無資料"}
          {data && data.source !== "live" && <span className="ml-2 rounded bg-accent-2/20 px-1.5 text-accent-2">{data.source}</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data && (
            <div className="flex overflow-hidden rounded border border-line text-sm" role="group" aria-label="顯示模式">
              {(["actual", "predict"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setMode(k);
                    setOpenId(null);
                    setSwapMode(false);
                  }}
                  aria-pressed={mode === k}
                  className={`px-2 py-1 ${mode === k ? "bg-accent font-bold text-bg" : "bg-panel text-muted"}`}
                >
                  {k === "actual" ? "實際結果" : "我的預測"}
                </button>
              ))}
            </div>
          )}
          {data && (
            <select
              value={focus ?? ""}
              onChange={(e) => setFocus(e.target.value || null)}
              className="max-w-40 rounded border border-line bg-panel px-2 py-1 text-sm"
              aria-label="隊伍篩選"
            >
              <option value="">全部隊伍</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code}・{t.name}
                </option>
              ))}
            </select>
          )}
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-live/50 bg-live/10 px-4 py-3 text-sm">
          <strong className="text-live">{error.message}</strong>
          {error.kind === "auth" && "（請更新 ESPORTS_API_KEY，見 README）"}
          {data ? `，目前顯示 ${taipeiDateTime(data.fetchedAt)} ${TZ_LABEL} 的資料。` : "，暫時無法顯示賽事資料。"}
          <button onClick={refresh} className="ml-2 underline underline-offset-2">
            重試
          </button>
        </div>
      )}

      {view && (
        <PredictContext.Provider value={predictCtx}>
          {sim && pstate && (
            <PredictionBar
              sim={sim}
              state={pstate}
              matches={sim.matches}
              swapMode={swapMode}
              onSwapMode={(on) => {
                setSwapMode(on);
                setSwapSel(null);
              }}
              onUpdate={update}
              onOpen={setOpenId}
              onToast={setToast}
            />
          )}
          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setJumpTo(null);
                }}
                className={`shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {t.label}
                {view.currentStage === t.key && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />}
              </button>
            ))}
          </nav>

          {tab === "schedule" && <ScheduleList matches={view.matches} focus={focus} highlight={jumpTo} />}
          {tab === "teams" && <TeamsView data={view} focus={focus} onFocus={setFocus} onJump={jump} />}
          {tab === "playin" && <PlayInBracket view={view.playin} focus={focus} />}
          {tab === "swiss" && <SwissBuckets view={view.swiss} focus={focus} />}
          {tab === "knockout" && <KnockoutBracket view={view.knockout} focus={focus} />}

          {openMatch && pstate && (
            <PickSheet
              match={openMatch}
              pick={pstate.picks[openMatch.id]}
              overridden={sim?.overridden.includes(openMatch.id) ?? false}
              onPick={(p) => {
                update(setPick(pstate, openMatch.id, p));
                if ((openMatch.bestOf || 1) === 1) setOpenId(null);
              }}
              onClear={() => update(setPick(pstate, openMatch.id, null))}
              onClose={() => setOpenId(null)}
            />
          )}
        </PredictContext.Provider>
      )}
      {toast && (
        <div role="status" className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[90vw] rounded bg-fg px-4 py-2 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
  };
  return (
    <button
      onClick={toggle}
      className="rounded border border-line bg-panel px-2 py-1 text-sm"
      aria-label={light ? "切換為深色主題" : "切換為亮色主題"}
    >
      {light ? "🌙" : "☀️"}
    </button>
  );
}
