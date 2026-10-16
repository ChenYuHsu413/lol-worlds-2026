// 內部資料模型（與 API 結構解耦）

export type Stage = "playin" | "swiss" | "knockout";
export type MatchState = "unstarted" | "inProgress" | "completed";

export interface Team {
  id: string;
  code: string;
  name: string;
  logo: string;
  region: string | null;
  league: string | null; // 賽區縮寫，如 "LCK"
  seed: number | null; // 賽區內種子序
}

export interface Match {
  id: string;
  stage: Stage;
  round: number | null; // 瑞士輪由 lib/swiss.ts 決定；淘汰賽 1=八強；Play-In 不使用
  bestOf: number;
  teamA: Team | null; // null = TBD
  teamB: Team | null;
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | null;
  state: MatchState;
  startTime: string; // ISO UTC
  blockName: string;
}

export interface SwissRecord {
  team: Team;
  wins: number;
  losses: number;
  status: "alive" | "qualified" | "eliminated";
}

export interface SwissSlot {
  match: Match;
  round: number;
  wins: number; // 賽前戰績（桶位）
  losses: number;
  provisional: boolean; // true = 隊伍未定，位置由 id 排序推測
}

export interface PoolSeat {
  team: Team | null;
  placeholder: string | null; // 隊伍未產生時的佔位文字，例如「Play-In 勝隊」
}

export interface SwissDrawView {
  pools: { pool: number; seats: PoolSeat[] }[];
  round1: [string, string][]; // 官方已公布的第一輪對戰（team id）
  issues: string[] | null; // checkRound1Draw 結果；null = 第一輪尚未公布
}

export interface SwissView {
  slots: SwissSlot[];
  records: SwissRecord[];
}

export type PlayInSlotKey = "ub1a" | "ub1b" | "ubFinal" | "lbRound1" | "lbFinal" | "grandFinal";

/** 籤表的一格：隊伍由來源決定（不看 API teams 順序），比分依 team id 對應 */
export interface Seat {
  team: Team | null;
  score: number | null; // 未開打為 null
  result: "win" | "loss" | null;
  placeholder: string | null; // 隊伍未定時顯示，例如「勝部首輪 A 勝者」
}

export interface PlayInSlot {
  key: PlayInSlotKey | null; // null = 第 3/4 場尚無法判定
  label: string; // 顯示名稱，如「勝部決賽」或「10/17 場次 A」
  match: Match;
  provisional: boolean;
  seats: [Seat, Seat]; // 上格、下格
  next: string; // 勝敗去向，例如「勝者 → 總決賽・敗者 → 敗部決賽」
}

export interface PlayInView {
  slots: PlayInSlot[];
  qualified: Team | null;
  eliminated: Team[];
}

export interface KnockoutSlot {
  round: number; // 0 = 八強
  index: number;
  match: Match;
  sourceLabels: [string, string] | null; // TBD 時顯示「八強 1 勝者」之類
  seats: [Seat, Seat]; // 上格 = 上一輪第 2i 場勝者、下格 = 第 2i+1 場勝者
  next: string; // 例如「勝者 → 四強第 1 場」
}

export interface KnockoutView {
  rounds: KnockoutSlot[][];
  roundNames: string[];
}

export type Role = "top" | "jungle" | "mid" | "bottom" | "support";

export interface Player {
  id: string;
  name: string; // 選手 ID
  role: Role | null;
  photo: string | null;
  substitute: boolean;
}

export interface TeamProfile {
  team: Team;
  startStage: "playin" | "swiss" | null;
  pool: number | null; // 瑞士輪第一輪抽籤分池
  players: Player[];
}

export type DataErrorKind = "auth" | "network" | "upstream";

export interface WorldsData {
  tournamentId: string;
  source: string; // "live" 或 fixture 名稱
  teams: Team[];
  matches: Match[];
  swiss: SwissView;
  playin: PlayInView;
  knockout: KnockoutView;
  swissDraw: SwissDrawView;
  profiles: TeamProfile[];
  currentStage: Stage;
  fetchedAt: string; // ISO，資料最後成功更新時間
  revalidateSeconds: number;
}

export interface WorldsPayload {
  data: WorldsData | null; // 失敗時為最後一次成功的資料（若有）
  error: { kind: DataErrorKind; message: string } | null;
}
