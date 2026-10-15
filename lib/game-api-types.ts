// 小局資料來源的回應型別，依 fixtures/games/*.json 的實際結構定義（2026-10-15 抓取）

// ---- LoL Esports live stats feed：https://feed.lolesports.com/livestats/v1/window/{gameId} ----
// 不帶 startingTime 回傳開局的前 10 個 frame；startingTime 超過結束時間則回傳終局 frame（gameState: "finished"）
// startingTime 需為 10 秒的整數倍（ISO，無毫秒）

export interface LiveParticipantMeta {
  participantId: number; // 藍方 1–5、紅方 6–10
  esportsPlayerId: string; // 與 getTeams 的 player id 同一套
  summonerName: string; // 帶隊伍代碼前綴，例如 "T1 Faker"
  championId: string; // Data Dragon 英雄 id，例如 "XinZhao"
  role: string; // top / jungle / mid / bottom / support
}
export interface LiveTeamMeta {
  esportsTeamId: string;
  participantMetadata: LiveParticipantMeta[];
}
export interface LiveParticipantFrame {
  participantId: number;
  totalGold: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  currentHealth: number;
  maxHealth: number;
}
export interface LiveTeamFrame {
  totalGold: number;
  inhibitors: number; // 該隊已摧毀的兵營數
  towers: number; // 該隊已摧毀的塔數
  barons: number;
  totalKills: number;
  dragons: string[]; // 依取得順序，例如 ["mountain", "hextech"]
  participants: LiveParticipantFrame[];
}
export interface LiveFrame {
  rfc460Timestamp: string;
  gameState: "in_game" | "paused" | "finished" | string;
  blueTeam: LiveTeamFrame;
  redTeam: LiveTeamFrame;
}
export interface LiveWindow {
  esportsGameId: string;
  esportsMatchId: string;
  gameMetadata: {
    patchVersion: string;
    blueTeamMetadata: LiveTeamMeta;
    redTeamMetadata: LiveTeamMeta;
  };
  frames: LiveFrame[];
}

// ---- Leaguepedia Special:CargoExport：ScoreboardGames=SG × PicksAndBansS7=PB ----
// Team1 為藍方；英雄為英文顯示名稱（"Xin Zhao"、"Kai'Sa"），需經 Data Dragon en_US 對應成 id
type DraftKey = `Team${1 | 2}${"Ban" | "Pick"}${1 | 2 | 3 | 4 | 5}`;

export type LeaguepediaGameRow = {
  GameId: string; // "2025 Season World Championship/Main Event_Finals_1_1"
  Team1: string;
  Team2: string;
  Winner: 1 | 2 | null;
  "DateTime UTC": string; // "2025-11-09 07:32:00"
  "Gamelength Number": number | null; // 分鐘
  Team1Picks: string[];
  Team2Picks: string[];
  Team1Bans: string[];
  Team2Bans: string[];
} & {
  // PB.Team{1,2}{Ban,Pick}{1..5}：依選角順序；未禁用時欄位不存在
  [K in DraftKey]?: string;
};

// ---- Riot Data Dragon ----
export interface DDragonChampion {
  id: string; // "MonkeyKing"
  key: string;
  name: string; // zh_TW："悟空"；en_US："Wukong"
  title: string;
}
export interface DDragonChampionFile {
  type: string;
  format: string;
  version: string;
  data: Record<string, DDragonChampion>;
}
