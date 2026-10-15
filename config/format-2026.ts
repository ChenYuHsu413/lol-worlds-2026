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

// 瑞士輪第一輪抽籤：第 1 池對第 4 池、第 2 池對第 3 池，同賽區不得交手（Leaguepedia 賽制說明）。
// 各隊分池見 config/teams-2026.json；Play-In 晉級隊伍為第 4 池。lib/swiss.ts 用來檢查官方配對
export const SWISS_R1_POOL_PAIRS: [number, number][] = [
  [1, 4],
  [2, 3],
];
export const PLAYIN_QUALIFIER_POOL = 4;

// 淘汰賽抽籤（媒體報導，未取得官方規則書原文）：兩支 3-0 隊伍各對一支 3-2 隊伍，且分在籤表兩側。
// lib/knockout.ts 用來檢查官方籤表
export const KNOCKOUT_DRAW_SOURCES = [
  "https://insider-gaming.com/when-will-all-the-lol-worlds-2026-draws-take-place/",
  "https://www.invenglobal.com/articles/26835/2026-lol-world-championship-kicks-off-october-16",
];
