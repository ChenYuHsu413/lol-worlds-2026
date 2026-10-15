// 預測模式推演（純函式）：實際結果 + 使用者預測 → 推演後的比賽清單
// 推演後的清單交給 lib/views.ts 重算各階段視圖，沿用既有的瑞士輪/Play-In/淘汰賽邏輯

import {
  BEST_OF,
  KNOCKOUT_DRAW,
  KNOCKOUT_ROUND_SIZES,
  PLAYIN_QUALIFIER_POOL,
  SWISS,
  SWISS_R1_POOL_PAIRS,
} from "../config/format-2026";
import { buildSwiss } from "./swiss";
import type { Match, SwissSlot, Team, TeamProfile } from "./types";

/** 預測一場：勝隊 team id，可選比分 [勝方局數, 敗方局數] */
export interface Pick {
  w: string;
  s?: [number, number];
}

export interface PredictionState {
  v: 1;
  seed: number; // 隨機抽籤的種子；「重新抽籤」即換種子
  picks: Record<string, Pick>; // match id → 預測
  swiss: Record<string, [string, string][]>; // 輪次 → 使用者手動指定的配對（僅限官方未公布的場次）
  ko: string[] | null; // 八強抽籤：8 個 team id，依 KNOCKOUT_DRAW 的位置排列
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
export const emptyPrediction = (seed = newSeed()): PredictionState => ({ v: 1, seed, picks: {}, swiss: {}, ko: null });

export interface DrawnPair {
  bucket: string; // "1-0"
  pair: [string, string];
}

export interface SimResult {
  matches: Match[];
  overridden: string[]; // 與實際結果衝突、已失效的預測（match id）
  stale: string[]; // 因使用者改了上游預測而對不上隊伍的預測
  hits: { correct: number; total: number }; // 已完賽場次中的預測命中
  champion: Team | null;
  swissDrawn: Record<number, DrawnPair[]>; // 推演抽出（非官方）的配對
  koDraw: string[] | null; // 推演抽出的八強籤表
  records: Record<string, [number, number]>; // 推演後的瑞士輪戰績
  playedBefore: Record<number, string[]>; // 各輪開打前已交手的組合 key（手動換配對時檢查重複交手）
  notes: string[];
}

// ---- 工具 ----

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const byId = (a: Match, b: Match) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
const byTime = (a: Match, b: Match) => a.startTime.localeCompare(b.startTime) || byId(a, b);
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const winnerOf = (m: Match | undefined): Team | null =>
  m?.state === "completed" ? (m.winner === "A" ? m.teamA : m.winner === "B" ? m.teamB : null) : null;
export const loserOf = (m: Match | undefined): Team | null =>
  m?.state === "completed" ? (m.winner === "A" ? m.teamB : m.winner === "B" ? m.teamA : null) : null;
const teamsOf = (m: Match) => [m.teamA, m.teamB].filter((t): t is Team => t !== null);

/** 回溯配對：每對都需通過 valid；無解回傳 null */
export function drawPairs(
  teams: string[],
  valid: (a: string, b: string) => boolean,
  rand: () => number,
): [string, string][] | null {
  if (teams.length % 2) return null;
  const go = (rest: string[]): [string, string][] | null => {
    if (rest.length === 0) return [];
    const [first, ...others] = rest;
    for (const partner of shuffle(others, rand)) {
      if (!valid(first, partner)) continue;
      const sub = go(others.filter((x) => x !== partner));
      if (sub) return [[first, partner], ...sub];
    }
    return null;
  };
  return go(shuffle(teams, rand));
}

/** 八強籤表是否符合規則：兩支 3-0 在 topSeedSlots、其對手為 3-2 */
export function validKoDraw(draw: string[], qualified: string[], records: Record<string, [number, number]>): boolean {
  if (draw.length !== qualified.length || new Set(draw).size !== draw.length) return false;
  if (!draw.every((id) => qualified.includes(id))) return false;
  const lossesOf = (id: string) => records[id]?.[1];
  const top = qualified.filter((id) => lossesOf(id) === 0);
  const bottom = qualified.filter((id) => lossesOf(id) === SWISS.lossesToEliminate - 1);
  if (top.length !== KNOCKOUT_DRAW.topSeedSlots.length || bottom.length < top.length) return true; // 戰績分布不符預期時不限制
  return (
    KNOCKOUT_DRAW.topSeedSlots.every((i) => lossesOf(draw[i]) === 0) &&
    KNOCKOUT_DRAW.topSeedOpponentSlots.every((i) => lossesOf(draw[i]) === SWISS.lossesToEliminate - 1)
  );
}

export function randomKoDraw(qualified: string[], records: Record<string, [number, number]>, rand: () => number): string[] {
  const lossesOf = (id: string) => records[id]?.[1];
  const top = shuffle(qualified.filter((id) => lossesOf(id) === 0), rand);
  const bottom = shuffle(qualified.filter((id) => lossesOf(id) === SWISS.lossesToEliminate - 1), rand);
  if (top.length !== KNOCKOUT_DRAW.topSeedSlots.length || bottom.length < top.length) return shuffle(qualified, rand);
  const draw: string[] = Array(qualified.length);
  KNOCKOUT_DRAW.topSeedSlots.forEach((slot, i) => (draw[slot] = top[i]));
  KNOCKOUT_DRAW.topSeedOpponentSlots.forEach((slot, i) => (draw[slot] = bottom[i]));
  const rest = shuffle(qualified.filter((id) => !draw.includes(id)), rand);
  for (let i = 0; i < draw.length; i++) if (!draw[i]) draw[i] = rest.shift()!;
  return draw;
}

// ---- 推演 ----

export function simulate(actual: Match[], profiles: TeamProfile[], state: PredictionState): SimResult {
  const matches: Match[] = structuredClone(actual);
  const res: SimResult = {
    matches,
    overridden: [],
    stale: [],
    hits: { correct: 0, total: 0 },
    champion: null,
    swissDrawn: {},
    koDraw: null,
    records: {},
    playedBefore: {},
    notes: [],
  };
  const teamById = new Map<string, Team>();
  for (const p of profiles) teamById.set(p.team.id, p.team);
  for (const m of matches) for (const t of teamsOf(m)) teamById.set(t.id, t);
  const profileOf = new Map(profiles.map((p) => [p.team.id, p]));
  let slotOf = new Map<string, SwissSlot>();

  // Bo 數以資料為準；資料缺漏時才依 config 規則
  const bestOf = (m: Match) => {
    if (m.bestOf) return m.bestOf;
    if (m.stage !== "swiss") return BEST_OF[m.stage];
    const s = slotOf.get(m.id);
    return s ? BEST_OF.swiss(s.wins, s.losses) : 1;
  };

  const applyPick = (m: Match) => {
    const pick = state.picks[m.id];
    if (m.state === "completed") {
      if (pick && !m.sim?.result) {
        res.hits.total++;
        if (winnerOf(m)?.id === pick.w) res.hits.correct++;
        else res.overridden.push(m.id);
      }
      return;
    }
    if (!pick || m.state !== "unstarted" || !m.teamA || !m.teamB) return;
    if (pick.w !== m.teamA.id && pick.w !== m.teamB.id) {
      (m.sim?.teams ? res.stale : res.overridden).push(m.id);
      return;
    }
    const bo = bestOf(m);
    const need = Math.ceil(bo / 2);
    const [ws, ls] = pick.s && pick.s[0] === need && pick.s[1] >= 0 && pick.s[1] < need ? pick.s : [need, 0];
    const aWins = pick.w === m.teamA.id;
    m.scoreA = aWins ? ws : ls;
    m.scoreB = aWins ? ls : ws;
    m.winner = aWins ? "A" : "B";
    m.state = "completed";
    m.sim = { ...m.sim, result: true };
  };

  const fill = (m: Match | undefined, cands: (Team | null)[]) => {
    if (!m || (m.teamA && m.teamB)) return;
    const known = teamsOf(m).map((t) => t.id);
    const add = cands.filter((t): t is Team => t !== null && !known.includes(t.id));
    if (!add.length) return;
    if (!m.teamA) m.teamA = add.shift()!;
    if (!m.teamB && add.length) m.teamB = add.shift()!;
    m.sim = { ...m.sim, teams: true };
  };

  // ---- Play-In：雙敗推進（結構同 lib/playin.ts）----
  const pi = matches.filter((m) => m.stage === "playin").sort(byTime);
  let qualifier: Team | null = null;
  if (pi.length === 6) {
    const [a, b, d1, d2, lbf, gf] = pi;
    applyPick(a);
    applyPick(b);
    const W = [winnerOf(a), winnerOf(b)];
    const L = [loserOf(a), loserOf(b)];
    const has = (m: Match, set: (Team | null)[]) => teamsOf(m).some((t) => set.some((x) => x?.id === t.id));
    // 第 3/4 場依隊伍判定；都未知時暫以時間較早者為勝部決賽
    const [ub, lb] = has(d1, L) || has(d2, W) ? [d2, d1] : [d1, d2];
    fill(ub, W);
    fill(lb, L);
    applyPick(ub);
    applyPick(lb);
    fill(lbf, [loserOf(ub), winnerOf(lb)]);
    applyPick(lbf);
    fill(gf, [winnerOf(ub), winnerOf(lbf)]);
    applyPick(gf);
    qualifier = winnerOf(gf);
  } else pi.forEach(applyPick);

  // ---- 瑞士輪 ----
  const sw = matches.filter((m) => m.stage === "swiss").sort(byId);
  slotOf = new Map(buildSwiss(structuredClone(sw), () => {}).view.slots.map((s) => [s.match.id, s] as const));
  const participants = new Set<string>();
  for (const p of profiles) if (p.startStage === "swiss") participants.add(p.team.id);
  if (qualifier) participants.add(qualifier.id);
  for (const m of sw) for (const t of teamsOf(m)) participants.add(t.id);
  const canDraw = participants.size === SWISS.teams;
  if (!canDraw) res.notes.push(`瑞士輪參賽隊伍 ${participants.size}/${SWISS.teams} 隊已知，暫不抽籤`);

  const rounds = [...new Set([...slotOf.values()].map((s) => s.round))].sort((x, y) => x - y);
  const recordsBefore = (r: number) => {
    const rec: Record<string, [number, number]> = {};
    for (const id of participants) rec[id] = [0, 0];
    for (const m of sw) {
      if ((slotOf.get(m.id)?.round ?? 99) >= r || m.state !== "completed") continue;
      const w = winnerOf(m);
      const l = loserOf(m);
      if (w && l) {
        (rec[w.id] ??= [0, 0])[0]++;
        (rec[l.id] ??= [0, 0])[1]++;
      }
    }
    return rec;
  };
  const playedBefore = (r: number) => {
    const s = new Set<string>();
    for (const m of sw) if ((slotOf.get(m.id)?.round ?? 99) < r && m.teamA && m.teamB) s.add(pairKey(m.teamA.id, m.teamB.id));
    return s;
  };

  for (const r of rounds) {
    const roundSlots = sw.filter((m) => slotOf.get(m.id)?.round === r);
    const prevDone = sw.every((m) => (slotOf.get(m.id)?.round ?? 99) >= r || m.state === "completed");
    const needsDraw = roundSlots.some((m) => !m.teamA || !m.teamB);
    res.playedBefore[r] = [...playedBefore(r)];
    if (canDraw && prevDone && needsDraw) {
      const rec = recordsBefore(r);
      const played = playedBefore(r);
      const rand = rng(state.seed + r * 7919);
      const pool = (id: string) => (id === qualifier?.id ? PLAYIN_QUALIFIER_POOL : (profileOf.get(id)?.pool ?? null));
      const league = (id: string) => teamById.get(id)?.league ?? null;
      const valid = (a: string, b: string) => {
        if (played.has(pairKey(a, b))) return false;
        if (r !== 1) return true;
        const pa = pool(a);
        const pb = pool(b);
        if (pa !== null && pb !== null && !SWISS_R1_POOL_PAIRS.some(([x, y]) => (pa === x && pb === y) || (pa === y && pb === x)))
          return false;
        return !(league(a) && league(a) === league(b));
      };
      const buckets = new Map<string, Match[]>();
      for (const m of roundSlots) {
        const s = slotOf.get(m.id)!;
        const k = `${s.wins}-${s.losses}`;
        buckets.set(k, [...(buckets.get(k) ?? []), m]);
      }
      res.swissDrawn[r] = [];
      for (const [bucket, slots] of buckets) {
        const [w, l] = bucket.split("-").map(Number);
        const inBucket = [...participants].filter((id) => rec[id]?.[0] === w && rec[id]?.[1] === l);
        const placed = new Set(slots.flatMap((m) => teamsOf(m).map((t) => t.id)));
        const free = inBucket.filter((id) => !placed.has(id));
        const empty = slots.filter((m) => !m.teamA && !m.teamB);
        if (free.length !== empty.length * 2) {
          res.notes.push(`第 ${r} 輪 ${bucket} 桶隊伍數與場次不符，略過抽籤`);
          continue;
        }
        const used = new Set<string>();
        const manual = (state.swiss[r] ?? []).filter(([a, b]) => {
          const ok = free.includes(a) && free.includes(b) && !used.has(a) && !used.has(b) && valid(a, b);
          if (ok) {
            used.add(a);
            used.add(b);
          }
          return ok;
        });
        const rest = free.filter((id) => !used.has(id));
        let drawn = drawPairs(rest, valid, rand);
        if (!drawn) {
          res.notes.push(`第 ${r} 輪 ${bucket} 桶找不到不重複的組合，改為允許重複交手`);
          drawn = drawPairs(rest, () => true, rand)!;
        }
        [...manual, ...drawn].forEach((pair, i) => {
          fill(empty[i], pair.map((id) => teamById.get(id) ?? null));
          res.swissDrawn[r].push({ bucket, pair });
        });
      }
    }
    roundSlots.forEach(applyPick);
  }
  res.records = recordsBefore(Infinity);

  // ---- 淘汰賽 ----
  const ko = matches.filter((m) => m.stage === "knockout").sort(byId);
  const koRounds: Match[][] = [];
  let off = 0;
  for (const size of KNOCKOUT_ROUND_SIZES) koRounds.push(ko.slice(off, (off += size)));
  const qf = koRounds[0] ?? [];
  const swissDone = sw.length > 0 && sw.every((m) => m.state === "completed");
  if (qf.length && qf.every((m) => !m.teamA && !m.teamB) && swissDone) {
    const qualified = Object.keys(res.records).filter((id) => res.records[id][0] >= SWISS.winsToQualify);
    if (qualified.length === qf.length * 2) {
      const draw =
        state.ko && validKoDraw(state.ko, qualified, res.records)
          ? state.ko
          : randomKoDraw(qualified, res.records, rng(state.seed + 104729));
      qf.forEach((m, i) => fill(m, [teamById.get(draw[2 * i]) ?? null, teamById.get(draw[2 * i + 1]) ?? null]));
      res.koDraw = draw;
    }
  }
  koRounds.forEach((round, r) =>
    round.forEach((m, i) => {
      if (r > 0) fill(m, [winnerOf(koRounds[r - 1][2 * i]), winnerOf(koRounds[r - 1][2 * i + 1])]);
      applyPick(m);
    }),
  );
  res.champion = winnerOf(koRounds.at(-1)?.[0]);
  return res;
}

// ---- 使用者操作（回傳新 state；不合法時回傳 null）----

export function setPick(state: PredictionState, matchId: string, pick: Pick | null): PredictionState {
  const picks = { ...state.picks };
  if (pick) picks[matchId] = pick;
  else delete picks[matchId];
  return { ...state, picks };
}

/** 交換同一輪、同戰績桶中兩支隊伍的配對（手動抽籤） */
export function swapSwiss(state: PredictionState, sim: SimResult, round: number, a: string, b: string): PredictionState | null {
  const drawn = sim.swissDrawn[round];
  if (!drawn) return null;
  const ia = drawn.findIndex((d) => d.pair.includes(a));
  const ib = drawn.findIndex((d) => d.pair.includes(b));
  if (ia < 0 || ib < 0 || ia === ib || drawn[ia].bucket !== drawn[ib].bucket) return null;
  const pairs = drawn.map((d) => [...d.pair] as [string, string]);
  pairs[ia] = pairs[ia].map((x) => (x === a ? b : x)) as [string, string];
  pairs[ib] = pairs[ib].map((x) => (x === b ? a : x)) as [string, string];
  // 交換後若與本輪之前的對手重複交手則不允許
  const played = new Set(sim.playedBefore[round] ?? []);
  if (pairs.some(([x, y]) => played.has(pairKey(x, y)))) return null;
  return { ...state, swiss: { ...state.swiss, [round]: pairs } };
}

/** 交換八強籤表兩支隊伍的位置（手動排籤），需符合 KNOCKOUT_DRAW 規則 */
export function swapKo(state: PredictionState, sim: SimResult, a: string, b: string): PredictionState | null {
  if (!sim.koDraw) return null;
  const draw = [...sim.koDraw];
  const ia = draw.indexOf(a);
  const ib = draw.indexOf(b);
  if (ia < 0 || ib < 0 || ia === ib) return null;
  [draw[ia], draw[ib]] = [draw[ib], draw[ia]];
  return validKoDraw(draw, sim.koDraw, sim.records) ? { ...state, ko: draw } : null;
}

/** 重新抽籤：換種子並清除手動配對 */
export const redraw = (state: PredictionState): PredictionState => ({ ...state, seed: newSeed(), swiss: {}, ko: null });

/** 移除已失效（被實際結果覆蓋或對不上隊伍）的預測 */
export function prune(state: PredictionState, ids: string[]): PredictionState {
  if (!ids.length) return state;
  const picks = { ...state.picks };
  for (const id of ids) delete picks[id];
  return { ...state, picks };
}

// ---- 分享：JSON → deflate-raw → base64url（放在 URL hash）----

const toB64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function encodePrediction(state: PredictionState): Promise<string> {
  const stream = new Blob([JSON.stringify(state)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toB64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodePrediction(encoded: string): Promise<PredictionState | null> {
  try {
    const stream = new Blob([fromB64Url(encoded)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return parsePrediction(JSON.parse(await new Response(stream).text()));
  } catch {
    return null;
  }
}

/** 驗證外部來源（localStorage / URL）的資料形狀 */
export function parsePrediction(x: unknown): PredictionState | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || typeof o.seed !== "number") return null;
  const isStr = (v: unknown): v is string => typeof v === "string";
  const picks: Record<string, Pick> = {};
  for (const [id, p] of Object.entries((o.picks as Record<string, unknown>) ?? {})) {
    const pk = p as Pick;
    if (!pk || !isStr(pk.w)) continue;
    const s = Array.isArray(pk.s) && pk.s.length === 2 && pk.s.every((n) => Number.isInteger(n)) ? pk.s : undefined;
    picks[id] = s ? { w: pk.w, s } : { w: pk.w };
  }
  const swiss: Record<string, [string, string][]> = {};
  for (const [r, pairs] of Object.entries((o.swiss as Record<string, unknown>) ?? {}))
    if (Array.isArray(pairs))
      swiss[r] = pairs.filter((p): p is [string, string] => Array.isArray(p) && p.length === 2 && p.every(isStr));
  const ko = Array.isArray(o.ko) && o.ko.every(isStr) ? (o.ko as string[]) : null;
  return { v: 1, seed: o.seed, picks, swiss, ko };
}
