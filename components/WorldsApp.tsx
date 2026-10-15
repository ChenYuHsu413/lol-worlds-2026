"use client";

import { useCallback, useEffect, useState } from "react";
import { taipeiDateTime, TZ_LABEL } from "@/lib/time";
import type { Stage, WorldsPayload } from "@/lib/types";
import { ScheduleList } from "./ScheduleList";

type Tab = Stage | "schedule";
const TABS: { key: Tab; label: string }[] = [
  { key: "playin", label: "Play-In" },
  { key: "swiss", label: "瑞士輪" },
  { key: "knockout", label: "淘汰賽" },
  { key: "schedule", label: "全部賽程" },
];

const CACHE_KEY = "worlds:last";

export function WorldsApp({ initial, fixture }: { initial: WorldsPayload; fixture: string | null }) {
  const [payload, setPayload] = useState(initial);
  const [tab, setTab] = useState<Tab>(initial.data?.currentStage ?? "schedule");
  const [focus, setFocus] = useState<string | null>(null);
  const { data, error } = payload;

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
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
        <h1 className="text-xl font-black tracking-wide">
          <span className="text-accent">WORLDS</span> 2026
        </h1>
        <div className="text-xs text-muted">
          {data ? `最後更新 ${taipeiDateTime(data.fetchedAt)} ${TZ_LABEL}` : "尚無資料"}
          {data && data.source !== "live" && <span className="ml-2 rounded bg-accent-2/20 px-1.5 text-accent-2">{data.source}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
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

      {data && (
        <>
          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {t.label}
                {data.currentStage === t.key && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />}
              </button>
            ))}
          </nav>

          {tab === "schedule" && <ScheduleList matches={data.matches} focus={focus} />}
          {tab !== "schedule" && (
            <ScheduleList matches={data.matches.filter((m) => m.stage === tab)} focus={focus} />
          )}
        </>
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
