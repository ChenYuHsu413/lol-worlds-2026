// 賽區縮寫 → 繁體中文全名（縮寫保留，畫面上以「LCK（韓國英雄聯盟冠軍聯賽）」呈現）

export const LEAGUE_NAMES: Record<string, string> = {
  LCK: "韓國英雄聯盟冠軍聯賽",
  LPL: "中國英雄聯盟職業聯賽",
  LEC: "歐洲英雄聯盟冠軍聯賽",
  LCS: "北美英雄聯盟冠軍聯賽",
  LCP: "太平洋英雄聯盟冠軍聯賽",
  CBLOL: "巴西英雄聯盟冠軍聯賽",
  LTA: "美洲英雄聯盟聯賽",
  "LTA North": "美洲英雄聯盟聯賽北區",
  "LTA South": "美洲英雄聯盟聯賽南區",
};

// 顯示順序（未列出的賽區排在最後）
export const LEAGUE_ORDER = ["LCK", "LPL", "LEC", "LCS", "LCP", "CBLOL", "LTA", "LTA North", "LTA South"];

export const ROLE_NAMES = {
  top: "上路",
  jungle: "打野",
  mid: "中路",
  bottom: "下路",
  support: "輔助",
} as const;

export type Role = keyof typeof ROLE_NAMES;
export const ROLE_ORDER: Role[] = ["top", "jungle", "mid", "bottom", "support"];

export const leagueLabel = (code: string | null) =>
  code ? (LEAGUE_NAMES[code] ? `${code}（${LEAGUE_NAMES[code]}）` : code) : "未知賽區";
