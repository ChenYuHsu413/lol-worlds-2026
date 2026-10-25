import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getTargetDate } from "@/lib/schedule";
import { taipeiDateKey, taipeiDayHeading, taipeiTime, TZ_LABEL } from "@/lib/time";
import type { Match } from "@/lib/types";
import { MatchCardMobile } from "./MatchCardMobile";
import { MatchState } from "./MatchState";
import { SeriesScore } from "./result-context";
import { hasGames, useOpenGames } from "./games-context";
import { TeamLogo, TeamName } from "./TeamLogo";
import { involves } from "./focus";

const STAGE_LABEL = { playin: "入圍賽", swiss: "瑞士輪", knockout: "淘汰賽" } as const;

export function ScheduleList({
  matches,
  focus,
  highlight = null,
}: {
  matches: Match[];
  focus: string | null;
  highlight?: string | null; // 從隊伍頁跳過來的場次
}) {
  const sorted = matches.filter((m) => m.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const days = new Map<string, Match[]>();
  for (const m of sorted) {
    const k = taipeiDateKey(m.startTime);
    days.set(k, [...(days.get(k) ?? []), m]);
  }
  const now = new Date();
  const today = taipeiDateKey(now.toISOString());
  const target = getTargetDate(matches, now, focus);
  const away = useScrollToDay(target, highlight !== null);

  return (
    <>
      <div className="hidden md:block">{desktop(days, focus, highlight, today)}</div>
      <div className="md:hidden">{mobile(days, focus, highlight, today)}</div>
      {away && target && (
        <button
          onClick={() => window.scrollTo({ top: dayTop(target) ?? 0, behavior: "smooth" })}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-accent px-3.5 py-2 text-sm font-bold text-bg shadow-lg"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {away === "up" ? "↑" : "↓"} 回到今天
        </button>
      )}
    </>
  );
}

// ---- 捲到目標日期 ----

/** 目標日期區塊捲到頁籤正下方時的 scrollY；桌機、手機各一份，取看得到的那個 */
function dayTop(day: string): number | null {
  const section = [`day-${day}`, `m-day-${day}`].map((id) => document.getElementById(id)).find((el) => el?.offsetParent);
  if (!section) return null;
  // 量 section 而不是 sticky 標題（標題黏住時量到的是黏住的位置）；再扣掉標題的 sticky top（= 頁籤列高度）
  const stickyTop = parseFloat(getComputedStyle(section.firstElementChild as HTMLElement).top) || 0;
  return section.getBoundingClientRect().top + window.scrollY - stickyTop;
}

/**
 * 掛載時（首次進入、從其他頁籤切回）直接捲到目標日期；資料更新只會重新 render、不會重新掛載，所以不會再捲。
 * 從隊伍頁跳過來（skip）時交給原本捲到該場的邏輯。
 * 圖片載入完成後校正一次位置，使用者已手動捲動過就不校正。
 * 回傳捲離目標日期超過一個螢幕高度時的方向（「回到今天」按鈕用）
 */
function useScrollToDay(target: string | null, skip: boolean): "up" | "down" | null {
  const initial = useRef({ target, skip });
  useLayoutEffect(() => {
    const { target: day, skip } = initial.current;
    if (skip || !day) return;
    const go = () => {
      const top = dayTop(day);
      if (top !== null) window.scrollTo(0, top);
    };
    go();

    let touched = false;
    const mark = () => void (touched = true);
    const intents = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    intents.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    let cancelled = false;
    const pending = [...document.querySelectorAll("img")].filter((img) => !img.complete);
    // lazy 圖片在畫面外不會載入，最多等 3 秒
    Promise.race([
      Promise.all(pending.map((img) => new Promise((r) => (img.addEventListener("load", r), img.addEventListener("error", r))))),
      new Promise((r) => setTimeout(r, 3000)),
    ]).then(() => !cancelled && !touched && go());
    return () => {
      cancelled = true;
      intents.forEach((e) => window.removeEventListener(e, mark));
    };
  }, []);

  const [away, setAway] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    const check = () => {
      const top = target ? dayTop(target) : null;
      const d = top === null ? 0 : window.scrollY - top;
      setAway(Math.abs(d) > window.innerHeight ? (d > 0 ? "up" : "down") : null);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [target]);
  return away;
}

const TodayTag = () => <span className="ml-2 rounded bg-accent px-1.5 py-px align-middle text-[11px] text-bg">今天</span>;

// ---- 手機（< 768px）：共用對戰卡；時區說明已在頁首顯示一次 ----

const mobileLabel = (m: Match) =>
  m.stage === "swiss" ? `瑞士輪${m.round ? ` R${m.round}` : ""}` : m.stage === "knockout" ? m.blockName : STAGE_LABEL[m.stage];

function mobile(days: Map<string, Match[]>, focus: string | null, highlight: string | null, today: string) {
  return (
    <div className="space-y-4">
      {[...days.entries()].map(([day, ms]) => (
        <section key={day} id={`m-day-${day}`}>
          {/* 固定在 sticky 頁籤下方 */}
          <h3 className="sticky top-[42px] z-20 -mx-4 bg-bg/95 px-4 py-1.5 text-sm font-bold text-accent backdrop-blur">
            {taipeiDayHeading(ms[0].startTime)}
            {day === today && <TodayTag />}
          </h3>
          <div className="space-y-2">
            {ms.map((m) => (
              <div key={m.id} id={`m-match-${m.id}`} className={`rounded-lg ${m.id === highlight ? "ring-2 ring-accent" : ""}`}>
                <MatchCardMobile match={m} label={mobileLabel(m)} focus={focus} timeOnly />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---- 桌機（≥ 768px）----

function desktop(days: Map<string, Match[]>, focus: string | null, highlight: string | null, today: string) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">所有時間為台灣時間 {TZ_LABEL}</p>
      {[...days.entries()].map(([day, ms]) => (
        <section key={day} id={`day-${day}`}>
          {/* 固定在 sticky 頁籤下方 */}
          <h3 className="sticky top-[39px] z-10 -mx-4 bg-bg/95 px-4 py-2 text-sm font-bold text-accent backdrop-blur">
            {taipeiDayHeading(ms[0].startTime)}
            {day === today && <TodayTag />}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {ms.map((m) => (
              <ScheduleRow
                key={m.id}
                match={m}
                dimmed={focus !== null && !involves(m, focus)}
                highlighted={m.id === highlight}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ScheduleRow({ match: m, dimmed, highlighted }: { match: Match; dimmed: boolean; highlighted: boolean }) {
  const done = m.state === "completed";
  const side = (which: "A" | "B") => {
    const team = which === "A" ? m.teamA : m.teamB;
    const lost = done && m.winner !== null && m.winner !== which;
    return { team, lost };
  };
  const a = side("A");
  const b = side("B");
  const openGames = useOpenGames();
  const clickable = hasGames(m);
  return (
    <li
      id={`match-${m.id}`}
      onClick={clickable ? () => openGames(m.id) : undefined}
      title={clickable ? "查看小局細節" : undefined}
      className={`${highlighted ? "bg-accent/15 ring-2 ring-inset ring-accent" : ""} ${
        clickable ? "cursor-pointer hover:bg-panel-2" : ""
      } grid grid-cols-[3.5rem_1fr] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition-opacity sm:grid-cols-[3.5rem_7rem_1fr_5rem] ${dimmed ? "opacity-30" : ""}`}
    >
      <div className="font-mono tabular-nums text-muted">
        {taipeiTime(m.startTime)}
        <div className="text-[10px] leading-tight">{TZ_LABEL}</div>
      </div>
      <div className="col-start-2 row-start-2 text-xs text-muted sm:col-start-auto sm:row-start-auto">
        {STAGE_LABEL[m.stage]}・{m.blockName === STAGE_LABEL[m.stage] ? "" : `${m.blockName}・`}Bo{m.bestOf}
      </div>
      <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-center gap-2 sm:col-start-auto sm:row-start-auto">
        <span className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 ${a.lost ? "opacity-50" : ""}`}>
          <TeamName team={a.team} />
          <TeamLogo team={a.team} />
        </span>
        <span className="min-w-14 shrink-0 text-center font-mono text-base font-bold tabular-nums">
          {m.state === "unstarted" ? <span className="text-muted">vs</span> : <SeriesScore match={m} />}
        </span>
        <span className={`flex min-w-0 flex-1 items-center gap-1.5 ${b.lost ? "opacity-50" : ""}`}>
          <TeamLogo team={b.team} />
          <TeamName team={b.team} />
        </span>
      </div>
      <div className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto sm:text-right">
        <MatchState state={m.state} />
      </div>
    </li>
  );
}
