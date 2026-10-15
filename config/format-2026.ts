// Worlds 2026 賽制設定。僅放「資料本身無法提供」的結構規則；Bo 數、隊伍、時間一律從 API 讀

export const WORLDS_LEAGUE_SLUG = "worlds";
export const TOURNAMENT_SLUG = "worlds_2026";

// standings stage slug → 內部階段
export const STAGE_SLUGS = {
  play_ins: "playin",
  swiss: "swiss",
  knockouts: "knockout",
} as const;

export const SWISS = {
  teams: 16,
  winsToQualify: 3,
  lossesToEliminate: 3,
};

// Play-In：4 隊雙敗、含總決賽，共 6 場。API 沒有勝部/敗部標示（standings 只有單一 section、
// eventDetails 無 bracket 欄位），只能依 startTime 順序對應下列位置。
// 第 3、4 場（同一天）無法從資料分辨誰是勝部決賽、誰是敗部首輪，交由 lib/playin.ts 依隊伍判定。
export const PLAYIN_SLOT_ORDER = ["ub1a", "ub1b", "day2a", "day2b", "lbFinal", "grandFinal"] as const;

// 淘汰賽：standings 內 knockouts 的 match 依 id 排序後，依序切成各輪。
// 規則「下一輪第 i 場由上一輪第 2i、2i+1 場勝者對戰」由 Worlds 2025 完整資料驗證
// （八強 id 排序 [T1-AL, G2-TES, HLE-GEN, CFO-KT] → 四強 [TES-T1, KT-GEN]）。
export const KNOCKOUT_ROUND_SIZES = [4, 2, 1];
export const KNOCKOUT_ROUND_NAMES = ["八強賽", "四強賽", "決賽"];

// ---- 瑞士輪分池與抽籤規則 ----
// 規則文字只收錄官方公告原文有寫的內容；查不到的規則（例如 Bo1/Bo3 的場次劃分）不列

export interface Source {
  title: string;
  url: string;
}

export const WORLDS_2026_PRIMER: Source = {
  title: "LoL Esports《Worlds 2026 Primer》（2026-10-05）",
  url: "https://lolesports.com/en-US/news/worlds-2026-primer",
};

// 分池（官方稱 Tier）出處；各隊所屬池記錄在 config/teams-2026.json 的 pool 欄位
export const POOL_SOURCES: Source[] = [
  WORLDS_2026_PRIMER,
  { title: "Leaguepedia：Worlds 2026 Main Event 參賽隊伍", url: "https://lol.fandom.com/wiki/2026_Season_World_Championship/Main_Event" },
];

export const SWISS_DRAW_RULES: { text: string; source: Source }[] = [
  { text: "第一輪對戰在 Play-In 結束後（10/18）隨機抽籤決定", source: WORLDS_2026_PRIMER },
  { text: "第一輪：第 1 池對第 4 池、第 2 池對第 3 池", source: WORLDS_2026_PRIMER },
  { text: "第一輪：同賽區隊伍不交手；第二輪起允許同賽區對戰", source: WORLDS_2026_PRIMER },
  { text: "整個瑞士輪不會與同一隊重複交手", source: WORLDS_2026_PRIMER },
  { text: "第 2～5 輪：與戰績相同的隊伍隨機配對（例如 1-0 對 1-0）", source: WORLDS_2026_PRIMER },
];

// 第一輪：第 1 池對第 4 池、第 2 池對第 3 池（出處同上）。lib/swiss.ts 用來檢查官方配對
export const SWISS_R1_POOL_PAIRS: [number, number][] = [
  [1, 4],
  [2, 3],
];
// 官方 Tier 4 含「Play-Ins Winner」
export const PLAYIN_QUALIFIER_POOL = 4;

// 淘汰賽抽籤：兩支 3-0 隊伍各對一支 3-2 隊伍（官方 Primer）；「分在籤表兩側」僅 Inven Global 報導，官方 Primer 未提及。
// lib/knockout.ts 用來檢查官方籤表
export const KNOCKOUT_DRAW_SOURCES = [
  WORLDS_2026_PRIMER.url,
  "https://www.invenglobal.com/articles/26835/2026-lol-world-championship-kicks-off-october-16",
];
