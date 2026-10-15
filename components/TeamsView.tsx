import { leagueLabel, ROLE_NAMES } from "@/config/leagues";
import { taipeiMonthDay, taipeiTime, TZ_LABEL } from "@/lib/time";
import type { Match, Player, TeamProfile, WorldsData } from "@/lib/types";
import { involves } from "./focus";
import { seedLabel, TeamLogo } from "./TeamLogo";

type Status = { label: string; tone: "alive" | "qualified" | "eliminated" | "champion"; record: string | null };

/** 沿用既有計算：瑞士輪戰績/狀態、Play-In 晉級淘汰、淘汰賽勝負 */
function statusOf(p: TeamProfile, data: WorldsData): Status {
  const id = p.team.id;
  const swiss = data.swiss.records.find((r) => r.team.id === id);
  const ko = data.knockout.rounds.flat().map((s) => s.match).filter((m) => involves(m, id) && m.state === "completed");
  const lostKo = ko.find((m) => (m.winner === "A" ? m.teamB : m.teamA)?.id === id);
  const final = data.knockout.rounds.at(-1)?.[0]?.match;
  const record = swiss ? `瑞士輪 ${swiss.wins}-${swiss.losses}` : null;

  if (final?.state === "completed" && (final.winner === "A" ? final.teamA : final.teamB)?.id === id)
    return { label: "冠軍", tone: "champion", record };
  if (lostKo) return { label: `${lostKo.blockName}淘汰`, tone: "eliminated", record };
  if (swiss?.status === "eliminated") return { label: "淘汰", tone: "eliminated", record };
  if (swiss?.status === "qualified") return { label: "晉級淘汰賽", tone: "qualified", record };
  if (data.playin.eliminated.some((t) => t.id === id)) return { label: "Play-In 淘汰", tone: "eliminated", record: null };
  if (data.playin.qualified?.id === id) return { label: "晉級瑞士輪", tone: "qualified", record };
  return { label: "存活", tone: "alive", record };
}

const TONE = {
  alive: "border-accent-2/50 text-accent-2",
  qualified: "border-win/60 text-win",
  eliminated: "border-loss/60 text-loss",
  champion: "border-accent bg-accent/15 text-accent",
};

export function TeamsView({
  data,
  focus,
  onFocus,
  onJump,
  open,
  onOpen: setOpen,
}: {
  data: WorldsData;
  focus: string | null;
  onFocus: (teamId: string | null) => void;
  onJump: (matchId: string) => void;
  open: string | null; // 展開中的隊伍（由外層控制，供小局面板跳轉）
  onOpen: (teamId: string | null) => void;
}) {
  if (data.profiles.length === 0) return <p className="text-muted">尚無參賽隊伍資料</p>;

  const groups = new Map<string, TeamProfile[]>();
  for (const p of data.profiles) {
    const k = p.team.league ?? "";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">共 {data.profiles.length} 隊。點隊伍卡可展開選手名單與場次。</p>
      {[...groups.entries()].map(([league, list]) => (
        <section key={league}>
          <h3 className="mb-2 text-sm font-bold text-accent">{leagueLabel(league || null)}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <TeamCard
                key={p.team.id}
                profile={p}
                data={data}
                expanded={open === p.team.id}
                onToggle={() => setOpen(open === p.team.id ? null : p.team.id)}
                focused={focus === p.team.id}
                onFocus={onFocus}
                onJump={onJump}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TeamCard({
  profile: p,
  data,
  expanded,
  onToggle,
  focused,
  onFocus,
  onJump,
}: {
  profile: TeamProfile;
  data: WorldsData;
  expanded: boolean;
  onToggle: () => void;
  focused: boolean;
  onFocus: (teamId: string | null) => void;
  onJump: (matchId: string) => void;
}) {
  const s = statusOf(p, data);
  const matches = data.matches
    .filter((m) => involves(m, p.team.id) && m.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div id={`team-${p.team.id}`} className={`self-start scroll-mt-4 rounded-lg border bg-panel ${focused ? "border-accent" : "border-line"}`}>
      <button onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 p-3 text-left">
        <TeamLogo team={p.team} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{p.team.name}</div>
          <div className="text-xs text-muted">
            {p.team.code}
            {p.team.seed !== null && `・${seedLabel(p.team)}`}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {p.startStage && (
              <span className="rounded bg-panel-2 px-1.5 py-0.5 text-muted">
                {p.startStage === "playin" ? "從 Play-In 出發" : "直接進瑞士輪"}
              </span>
            )}
            {p.startStage === "swiss" && p.pool !== null && (
              <span className="rounded border border-accent/50 px-1.5 py-0.5 text-accent">第 {p.pool} 池</span>
            )}
            <span className={`rounded border px-1.5 py-0.5 font-semibold ${TONE[s.tone]}`}>{s.label}</span>
            {s.record && <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono">{s.record}</span>}
          </div>
        </div>
        <span className="text-muted" aria-hidden>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-line p-3">
          <button
            onClick={() => onFocus(focused ? null : p.team.id)}
            className="rounded border border-accent px-2 py-1 text-xs font-semibold text-accent"
          >
            {focused ? "取消只看這隊" : "只看這隊"}
          </button>

          <div>
            <h4 className="mb-1 text-xs font-bold text-muted">選手名單</h4>
            {p.players.length === 0 ? (
              <p className="text-xs text-muted">尚無名單資料</p>
            ) : (
              <ul className="space-y-1">
                {p.players.map((pl) => (
                  <PlayerRow key={pl.id} player={pl} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="mb-1 text-xs font-bold text-muted">場次 {TZ_LABEL}</h4>
            {matches.length === 0 ? (
              <p className="text-xs text-muted">賽程尚未排定</p>
            ) : (
              <ul className="space-y-0.5">
                {matches.map((m) => (
                  <MatchLink key={m.id} match={m} teamId={p.team.id} onJump={onJump} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRow({ player: pl }: { player: Player }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {pl.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pl.photo} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full bg-panel-2 object-cover object-top" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-xs text-muted" aria-hidden>
          {pl.name.slice(0, 1)}
        </span>
      )}
      <span className="w-9 shrink-0 text-xs text-muted">{pl.role ? ROLE_NAMES[pl.role] : "—"}</span>
      <span className="truncate font-semibold">{pl.name}</span>
      {pl.substitute && <span className="rounded bg-panel-2 px-1 text-[10px] text-muted">替補</span>}
    </li>
  );
}

function MatchLink({ match: m, teamId, onJump }: { match: Match; teamId: string; onJump: (id: string) => void }) {
  const isA = m.teamA?.id === teamId;
  const opp = isA ? m.teamB : m.teamA;
  const mine = isA ? m.scoreA : m.scoreB;
  const theirs = isA ? m.scoreB : m.scoreA;
  const won = m.state === "completed" && (m.winner === "A") === isA;
  return (
    <li>
      <button
        onClick={() => onJump(m.id)}
        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-panel-2"
      >
        <span className="w-20 shrink-0 font-mono text-muted">
          {taipeiMonthDay(m.startTime)} {taipeiTime(m.startTime)}
        </span>
        <span className="w-10 shrink-0 text-muted">Bo{m.bestOf}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1">
          vs <TeamLogo team={opp} size={14} /> <span className="truncate">{opp?.code ?? "TBD"}</span>
        </span>
        <span className={`font-mono ${m.state === "completed" ? (won ? "text-win" : "text-muted") : m.state === "inProgress" ? "text-live" : "text-muted"}`}>
          {m.state === "unstarted" ? "未開始" : `${mine}-${theirs}`}
        </span>
      </button>
    </li>
  );
}
