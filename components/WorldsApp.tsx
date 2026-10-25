"use client";

import { useCallback, useEffect, useState } from "react";
import { provisionalFromGames, type Score } from "@/lib/result";
import { taipeiDateTime, taipeiMonthDay, taipeiTime, TZ_LABEL } from "@/lib/time";
import type { Stage, WorldsData, WorldsPayload } from "@/lib/types";
import { GamesContext } from "./games-context";
import { GamesPanel } from "./GamesPanel";
import { KnockoutBracket } from "./KnockoutBracket";
import { PlayInBracket } from "./PlayInBracket";
import { ProvisionalContext } from "./result-context";
import { ScheduleList } from "./ScheduleList";
import { SwissBuckets } from "./SwissBuckets";
import { SwissPools } from "./SwissPools";
import { SwissModeToggle, useSwissMode } from "./SwissTable";
import { TeamsView } from "./TeamsView";

type Tab = Stage | "schedule" | "teams";
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: "playin", label: "Play-In", short: "Play-In" },
  { key: "swiss", label: "瑞士輪", short: "瑞士輪" },
  { key: "knockout", label: "淘汰賽", short: "淘汰賽" },
  { key: "schedule", label: "全部賽程", short: "賽程" },
  { key: "teams", label: "參賽隊伍", short: "隊伍" },
];

const CACHE_KEY = "worlds:last";

export function WorldsApp({ initial, fixture }: { initial: WorldsPayload; fixture: string | null }) {
  const [payload, setPayload] = useState(initial);
  const [tab, setTab] = useState<Tab>(initial.data?.currentStage ?? "schedule");
  const [focus, setFocus] = useState<string | null>(null);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [gamesId, setGamesId] = useState<string | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [swissMode, setSwissMode] = useSwissMode();
  const { data, error } = payload;

  // 從隊伍頁點場次：切到賽程列表並捲到該場
  const jump = (matchId: string) => {
    setTab("schedule");
    setJumpTo(matchId);
  };
  useEffect(() => {
    if (tab !== "schedule" || !jumpTo) return;
    // 等切換 Tab 後的版面完成再捲動
    // 桌機列與手機卡各有一份，捲到目前看得到的那一個
    const id = setTimeout(() =>
      [`match-${jumpTo}`, `m-match-${jumpTo}`]
        .map((x) => document.getElementById(x))
        .find((el) => el?.offsetParent)
        ?.scrollIntoView({ block: "center" }),
    );
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

  // 結果更新中的場次：每次資料更新時抓小局資料，小局已判定勝方就顯示暫定比分；上游正式比分出來後自動不再使用
  const [provisional, setProvisional] = useState<Record<string, Score>>({});
  useEffect(() => {
    const pending = data?.matches.filter((m) => m.resultPending) ?? [];
    if (!pending.length) return;
    let alive = true;
    Promise.all(
      pending.map(async (m) => {
        try {
          const res = await fetch(`/api/games/${m.id}${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ""}`);
          const json = await res.json();
          return [m.id, json.data ? provisionalFromGames(m, json.data) : null] as const;
        } catch {
          return [m.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (alive) setProvisional(Object.fromEntries(entries.filter((e): e is readonly [string, Score] => e[1] !== null)));
    });
    return () => {
      alive = false;
    };
  }, [data, fixture]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      {/* 桌機（≥ 768px）頁首 */}
      <header className="hidden flex-wrap items-center gap-x-4 gap-y-2 py-4 md:flex">
        <h1 className="text-xl font-black tracking-wide">
          <span className="text-accent">WORLDS</span> 2026
        </h1>
        <div className="text-xs text-muted">
          {data ? `最後更新 ${taipeiDateTime(data.fetchedAt)} ${TZ_LABEL}` : "尚無資料"}
          {data && data.source !== "live" && <span className="ml-2 rounded bg-accent-2/20 px-1.5 text-accent-2">{data.source}</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data && (
            <TeamSelect data={data} focus={focus} onChange={setFocus} className="max-w-40" />
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* 手機（< 768px）頁首：標題＋主題切換／隊伍篩選滿寬／最後更新 */}
      <header className="space-y-2 pb-2 pt-3 md:hidden">
        <div className="flex items-center">
          <h1 className="text-xl font-black tracking-wide">
            <span className="text-accent">WORLDS</span> 2026
          </h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        {data && <TeamSelect data={data} focus={focus} onChange={setFocus} className="w-full" />}
        <div className="text-[11px] text-muted">
          {data ? `最後更新 ${taipeiMonthDay(data.fetchedAt)} ${taipeiTime(data.fetchedAt)}・時間皆為台灣時間 ${TZ_LABEL}` : "尚無資料"}
          {data && data.source !== "live" && <span className="ml-2 rounded bg-accent-2/20 px-1.5 text-accent-2">{data.source}</span>}
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
        <GamesContext.Provider value={setGamesId}><ProvisionalContext.Provider value={provisional}>
          {/* 桌機頁籤固定在頂部（賽程頁捲到今天時，日期標題接在頁籤下方） */}
          <nav
            className="sticky top-0 z-30 -mx-4 mb-4 hidden gap-1 overflow-x-auto border-b border-line bg-bg/95 px-4 backdrop-blur md:flex"
            role="tablist"
          >
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
                {data.currentStage === t.key && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />}
              </button>
            ))}
          </nav>

          {/* 手機頁籤：五個平均分配、固定在頂部 */}
          <nav
            className="sticky top-0 z-30 -mx-4 mb-3 grid grid-cols-5 border-b border-line bg-bg/95 px-1 backdrop-blur md:hidden"
            role="tablist"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setJumpTo(null);
                }}
                className={`relative border-b-2 py-2.5 text-[13px] font-semibold ${
                  tab === t.key ? "border-accent text-accent" : "border-transparent text-muted"
                }`}
              >
                {t.short}
                {data.currentStage === t.key && <span className="absolute right-0.5 top-1.5 h-1.5 w-1.5 rounded-full bg-live" />}
              </button>
            ))}
          </nav>

          {tab === "schedule" && <ScheduleList matches={data.matches} focus={focus} highlight={jumpTo} />}
          {tab === "teams" && (
            <TeamsView data={data} focus={focus} onFocus={setFocus} onJump={jump} open={openTeam} onOpen={setOpenTeam} />
          )}
          {tab === "playin" && <PlayInBracket view={data.playin} focus={focus} />}
          {tab === "swiss" && (
            <>
              <SwissModeToggle mode={swissMode} onChange={setSwissMode} />
              <SwissPools draw={data.swissDraw} teams={data.teams} />
              <SwissBuckets view={data.swiss} focus={focus} mode={swissMode} onFocus={setFocus} />
            </>
          )}
          {tab === "knockout" && <KnockoutBracket view={data.knockout} focus={focus} />}

          {gamesId && (
            <GamesPanel
              matchId={gamesId}
              match={data.matches.find((m) => m.id === gamesId)}
              fixture={fixture}
              onClose={() => setGamesId(null)}
              onPlayer={(teamId) => {
                // 點選手：切到參賽隊伍頁並展開該隊
                setGamesId(null);
                setTab("teams");
                setOpenTeam(teamId);
                setTimeout(() => document.getElementById(`team-${teamId}`)?.scrollIntoView({ block: "start" }));
              }}
            />
          )}
        </ProvisionalContext.Provider></GamesContext.Provider>
      )}
    </div>
  );
}

function TeamSelect({
  data,
  focus,
  onChange,
  className,
}: {
  data: WorldsData;
  focus: string | null;
  onChange: (id: string | null) => void;
  className: string;
}) {
  return (
    <select
      value={focus ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded border border-line bg-panel px-2 py-1 text-sm ${className}`}
      aria-label="隊伍篩選"
    >
      <option value="">全部隊伍</option>
      {data.teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.code}・{t.name}
        </option>
      ))}
    </select>
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
