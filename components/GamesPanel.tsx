import { useEffect, useRef, useState } from "react";
import { ROLE_NAMES } from "@/config/leagues";
import {
  championImage,
  fearlessPool,
  isAwaitingLive,
  isDataPending,
  type GameDetail,
  type GamePlayer,
  type GameSide,
  type MatchGames,
} from "@/lib/games";

const DRAGON_NAMES: Record<string, string> = {
  ocean: "海洋",
  mountain: "山脈",
  infernal: "炎獄",
  cloud: "雲端",
  hextech: "海克斯",
  chemtech: "化工",
  elder: "遠古",
};

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const kGold = (g: number) => `${(g / 1000).toFixed(1)}k`;

/** 系列賽小局細節（展開時才抓取） */
export function GamesPanel({
  matchId,
  fixture,
  onClose,
  onPlayer,
}: {
  matchId: string;
  fixture: string | null;
  onClose: () => void;
  onPlayer: (teamId: string) => void;
}) {
  const [state, setState] = useState<{ data: MatchGames | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tab, setTab] = useState<number | "fearless">(1);
  const live = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/games/${matchId}${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ""}`);
        const json = await res.json();
        if (!alive) return;
        live.current = !!json.data?.games.some((g: GameDetail) => g.state === "inProgress");
        setState({ data: json.data, error: json.error, loading: false });
        // 預設顯示最新一局已開打的局
        const started = (json.data?.games ?? []).filter((g: GameDetail) => g.state !== "unstarted");
        if (started.length) setTab((t) => (t === 1 ? started.at(-1).number : t));
      } catch {
        if (alive) setState({ data: null, error: "無法連線到伺服器", loading: false });
      }
    };
    load();
    // 進行中的局 30 秒更新一次
    const id = setInterval(() => live.current && load(), 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [matchId, fixture]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data } = state;
  const team = (id: string | null) => data?.teams.find((t) => t.id === id);
  const game = typeof tab === "number" ? data?.games.find((g) => g.number === tab) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="小局細節"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl border border-line bg-bg sm:h-[85vh] sm:rounded-xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="font-bold">
            {data ? `${data.teams[0]?.code} ${data.teams[0]?.gameWins} : ${data.teams[1]?.gameWins} ${data.teams[1]?.code}` : "小局細節"}
          </span>
          <button onClick={onClose} className="ml-auto px-2 text-lg" aria-label="關閉">
            ✕
          </button>
        </div>

        {state.loading && <p className="p-4 text-sm text-muted">載入中…</p>}
        {!state.loading && !data && <p className="p-4 text-sm text-live">{state.error ?? "沒有小局資料"}</p>}

        {data && (
          <>
            <nav className="flex flex-wrap gap-1 border-b border-line px-2 md:flex-nowrap md:overflow-x-auto" role="tablist">
              {data.games.map((g) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={tab === g.number}
                  // 尚未開打的局：淡化且不可點
                  disabled={g.state === "unstarted"}
                  title={g.state === "unstarted" ? "尚未開始" : undefined}
                  onClick={() => setTab(g.number)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${
                    tab === g.number ? "border-accent text-accent" : "border-transparent text-muted"
                  }`}
                >
                  {/* 手機用短標籤，避免局數 Tab 橫向溢出 */}
                  <span className="md:hidden">G{g.number}</span>
                  <span className="hidden md:inline">Game {g.number}</span>
                  {g.state === "inProgress" && <span className="live-blink ml-1 text-live">●</span>}
                </button>
              ))}
              {data.games.length > 1 && (
                <button
                  role="tab"
                  aria-selected={tab === "fearless"}
                  onClick={() => setTab("fearless")}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
                    tab === "fearless" ? "border-accent text-accent" : "border-transparent text-muted"
                  }`}
                >
                  Fearless
                </button>
              )}
            </nav>
            <div className="flex-1 overflow-y-auto p-4">
              {data.games.length === 0 && <p className="text-sm text-muted">尚未開打</p>}
              {game?.state === "unstarted" && <p className="text-sm text-muted">尚未開始</p>}
              {game && game.state !== "unstarted" && (
                <GameView game={game} data={data} teamCode={(id) => team(id)?.code ?? "?"} onPlayer={onPlayer} />
              )}
              {tab === "fearless" && <FearlessView data={data} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Champ({ id, data, size = 28, dim }: { id: string; data: MatchGames; size?: number; dim?: boolean }) {
  const name = data.champions.names[id] ?? id;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championImage(data.champions.version, id)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded ${dim ? "opacity-60 grayscale" : ""}`}
      style={{ width: size, height: size }}
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
    />
  );
}

function GameView({
  game: g,
  data,
  teamCode,
  onPlayer,
}: {
  game: GameDetail;
  data: MatchGames;
  teamCode: (id: string | null) => string;
  onPlayer: (teamId: string) => void;
}) {
  const goldDiff = g.blue.gold !== null && g.red.gold !== null ? g.blue.gold - g.red.gold : null;
  const noStats = g.blue.players.length === 0 && g.red.players.length === 0;
  // 完賽 6 小時內缺的欄位顯示「資料整理中」（Leaguepedia 常在賽後才補），之後才隱藏
  const pending = isDataPending(g, Date.now());
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {g.state === "inProgress" && <span className="live-blink font-bold text-live">● 進行中</span>}
        {g.winner && (
          <span>
            勝方：<strong className="text-win">{teamCode(g[g.winner].teamId)}</strong>
            {g.winnerSource === "inferred" && "（依終局數據推估）"}
          </span>
        )}
        {!g.winner && pending && <span>勝方：資料整理中</span>}
        {g.durationSec !== null && <span>時長 {mmss(g.durationSec)}</span>}
        {g.patch && <span>版本 {g.patch.split(".").slice(0, 2).join(".")}</span>}
        {goldDiff !== null && (
          <span>
            金錢差 {teamCode(goldDiff >= 0 ? g.blue.teamId : g.red.teamId)} +{kGold(Math.abs(goldDiff))}
          </span>
        )}
      </div>

      {isAwaitingLive(g) ? (
        // 剛開打時 feed 尚無選手資料；面板每 30 秒自動更新，資料出現後補上
        <p className="text-muted">等待即時資料…</p>
      ) : noStats ? (
        <p className="text-muted">此局沒有局內數據</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["blue", "red"] as const).map((side) => (
            <SideView key={side} side={side} s={g[side]} won={g.winner === side} data={data} code={teamCode(g[side].teamId)} onPlayer={onPlayer} />
          ))}
        </div>
      )}

      {(g.blue.bans || g.red.bans) && (
        <section>
          <h4 className="mb-1 text-xs font-bold text-muted">Ban 位</h4>
          {(["blue", "red"] as const).map((side) =>
            g[side].bans ? (
              <div key={side} className="mb-1 flex items-center gap-1">
                <span className={`w-10 text-xs ${side === "blue" ? "text-sky-400" : "text-rose-400"}`}>{teamCode(g[side].teamId)}</span>
                {g[side].bans!.map((id, i) => (
                  <Champ key={i} id={id} data={data} size={26} dim />
                ))}
              </div>
            ) : null,
          )}
        </section>
      )}

      {g.draft && (
        <section>
          <h4 className="mb-1 text-xs font-bold text-muted">選角順序（Ban / Pick）</h4>
          <ol className="flex flex-wrap gap-1">
            {g.draft.map((s, i) => (
              <li
                key={i}
                className={`flex items-center gap-0.5 rounded border px-0.5 ${s.side === "blue" ? "border-sky-500/50" : "border-rose-500/50"}`}
                title={`${i + 1}. ${teamCode(g[s.side].teamId)} ${s.type === "ban" ? "Ban" : "Pick"} ${data.champions.names[s.champion] ?? s.champion}`}
              >
                <span className="text-[10px] text-muted">{i + 1}</span>
                <Champ id={s.champion} data={data} size={22} dim={s.type === "ban"} />
              </li>
            ))}
          </ol>
        </section>
      )}
      {!g.draft && pending && <p className="text-xs text-muted">Ban 位與選角順序資料整理中（Leaguepedia 通常在賽後才補上）。</p>}
      {!g.draft && !pending && !data.sources.leaguepedia && (
        <p className="text-xs text-muted">Leaguepedia 暫時無法連線，未顯示 Ban 位與選角順序。</p>
      )}
    </div>
  );
}

function SideView({
  side,
  s,
  won,
  data,
  code,
  onPlayer,
}: {
  side: "blue" | "red";
  s: GameSide;
  won: boolean;
  data: MatchGames;
  code: string;
  onPlayer: (teamId: string) => void;
}) {
  const stats: [string, string | number | null][] = [
    ["擊殺", s.kills],
    ["塔", s.towers],
    ["兵營", s.inhibitors],
    ["巴龍", s.barons],
    ["龍", s.dragons ? s.dragons.length : null],
    ["金錢", s.gold !== null ? kGold(s.gold) : null],
  ];
  return (
    <section className={`rounded-lg border p-2 ${side === "blue" ? "border-sky-500/40" : "border-rose-500/40"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded px-1.5 text-xs font-bold ${side === "blue" ? "bg-sky-500/20 text-sky-400" : "bg-rose-500/20 text-rose-400"}`}>
          {side === "blue" ? "藍方" : "紅方"}
        </span>
        <span className="font-bold">{code}</span>
        {won && <span className="text-xs font-bold text-win">勝</span>}
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {stats
          .filter(([, v]) => v !== null)
          .map(([k, v]) => (
            <span key={k}>
              <span className="text-muted">{k}</span> <strong>{v}</strong>
            </span>
          ))}
        {s.dragons && s.dragons.length > 0 && (
          <span className="text-muted">（{s.dragons.map((d) => DRAGON_NAMES[d] ?? d).join("、")}）</span>
        )}
      </div>
      <ul className="space-y-1">
        {s.players.map((p) => (
          <PlayerRow key={p.participantId} p={p} data={data} teamId={s.teamId} onPlayer={onPlayer} />
        ))}
      </ul>
    </section>
  );
}

function PlayerRow({ p, data, teamId, onPlayer }: { p: GamePlayer; data: MatchGames; teamId: string | null; onPlayer: (id: string) => void }) {
  const kda = p.kills !== null ? `${p.kills}/${p.deaths}/${p.assists}` : null;
  return (
    <li className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[11px] text-muted">{p.role ? ROLE_NAMES[p.role] : ""}</span>
      <Champ id={p.champion} data={data} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {teamId && p.playerId ? (
          <button onClick={() => onPlayer(teamId)} className="truncate text-left font-semibold underline-offset-2 hover:underline">
            {p.name}
          </button>
        ) : (
          <span className="truncate font-semibold" title="未對應到參賽隊伍名單">
            {p.name}
          </span>
        )}
        <span className="truncate text-[11px] text-muted">{data.champions.names[p.champion] ?? p.champion}</span>
      </span>
      {kda && <span className="w-16 text-right font-mono text-xs">{kda}</span>}
      {p.cs !== null && <span className="hidden w-10 text-right font-mono text-xs text-muted sm:inline">{p.cs}</span>}
    </li>
  );
}

function FearlessView({ data }: { data: MatchGames }) {
  const steps = fearlessPool(data.games);
  const [at, setAt] = useState(steps.length ? steps[steps.length - 1].beforeGame : 0);
  const step = steps.find((s) => s.beforeGame === at) ?? steps[steps.length - 1];
  const lastGame = data.games.at(-1)?.number ?? 0;
  const team = (id: string | null) => data.teams.find((t) => t.id === id);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">全局 Fearless：系列賽中任一隊用過的英雄，之後的局數兩隊都不能再選。</p>
      {steps.length <= 2 ? (
        steps.length === 0 && <p className="text-muted">尚無選角資料</p>
      ) : (
        <div className="flex flex-wrap gap-1" role="group" aria-label="檢視時間點">
          {steps
            .filter((s) => s.beforeGame > 1)
            .map((s) => (
              <button
                key={s.beforeGame}
                onClick={() => setAt(s.beforeGame)}
                aria-pressed={at === s.beforeGame}
                className={`rounded border px-2 py-0.5 text-xs ${at === s.beforeGame ? "border-accent text-accent" : "border-line text-muted"}`}
              >
                {s.beforeGame > lastGame ? "目前" : `第 ${s.beforeGame} 局前`}
              </button>
            ))}
        </div>
      )}
      {step && (
        <section>
          <h4 className="mb-2 text-xs font-bold text-accent">
            已鎖定英雄池（{step.locked.length}）
            <span className="ml-2 font-normal text-muted">
              {data.teams.map((t) => `${t.code} ${step.locked.filter((l) => l.teamId === t.id).length}`).join("・")}
            </span>
          </h4>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5">
            {step.locked.map((l) => {
              const t = team(l.teamId);
              const name = data.champions.names[l.champion] ?? l.champion;
              return (
                <li key={l.champion} className="relative" title={`${name}・${t?.code ?? "?"} 第 ${l.game} 局使用`}>
                  <Champ id={l.champion} data={data} size={44} />
                  <span className="absolute left-0 top-0 rounded-br bg-black/75 px-0.5 font-mono text-[10px] leading-tight text-white">
                    G{l.game}
                  </span>
                  {t && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.logo}
                      alt={t.code}
                      className="absolute bottom-0 right-0 h-4 w-4 rounded-tl bg-slate-800 object-contain p-px"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
