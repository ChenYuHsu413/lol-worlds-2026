// LoL Esports persisted/gw API 回應型別
// 依 fixtures/*.json 的實際結構定義（2026-10-15 抓取），非官方文件；欄位可能隨時變動

export type MatchState = "unstarted" | "inProgress" | "completed";
export type Outcome = "win" | "loss" | null;

interface Envelope<T> {
  data: T;
}

// ---- getLeagues ----
export interface ApiLeague {
  id: string;
  slug: string; // Worlds = "worlds"
  name: string;
  region: string;
  image: string;
  priority: number;
  displayPriority: { position: number; status: string };
}
export type GetLeaguesResponse = Envelope<{ leagues: ApiLeague[] }>;

// ---- getTournamentsForLeague ----
export interface ApiTournament {
  id: string;
  slug: string; // e.g. "worlds_2026"
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
}
export type GetTournamentsResponse = Envelope<{
  leagues: { tournaments: ApiTournament[] }[];
}>;

// ---- getStandings ----
// 有 team id / slug / state / outcome，但沒有 startTime、Bo 數、輪次；previousMatchIds 實測皆為空陣列
export interface ApiStandingsTeam {
  id: string; // TBD 時為 "0"
  slug: string; // TBD 時為 "tbd"
  name: string;
  code: string; // TBD 時為 "TBD"
  image: string;
  result: { outcome: Outcome; gameWins: number } | null;
}
export interface ApiStandingsMatch {
  id: string;
  state: MatchState;
  previousMatchIds: string[];
  flags: string[];
  teams: ApiStandingsTeam[];
}
export interface ApiSection {
  name: string;
  matches: ApiStandingsMatch[];
  rankings: unknown[]; // Worlds 各階段皆為空
}
export interface ApiStage {
  name: string; // 本地化名稱，如「瑞士制循環賽」
  type: string | null;
  slug: string; // "play_ins" | "swiss" | "knockouts"（以資料為準）
  sections: ApiSection[];
}
export type GetStandingsResponse = Envelope<{ standings: { stages: ApiStage[] }[] }>;

// ---- getSchedule ----
// 以 league 為單位、跨年度分頁（每頁約 80 場），從「目前」頁開始，需沿 newer/older token 翻頁
// 沒有 team id；record 是該隊「目前」的階段戰績，不是賽前戰績
export interface ApiScheduleTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: Outcome; gameWins: number } | null;
  record: { wins: number; losses: number } | null;
}
export interface ApiScheduleEvent {
  startTime: string; // ISO UTC
  state: MatchState;
  type: "match" | string;
  blockName: string; // 入圍賽 / 瑞士制循環賽 / 八強賽 / 準決賽 / 決賽
  league: { name: string; slug: string };
  match: {
    id: string;
    flags: string[];
    teams: ApiScheduleTeam[];
    strategy: { type: "bestOf" | string; count: number };
  };
}
export type GetScheduleResponse = Envelope<{
  schedule: {
    pages: { older: string | null; newer: string | null };
    events: ApiScheduleEvent[];
  };
}>;

// ---- getCompletedEvents ----
// 只含已完賽場次；沒有 state / outcome / team id，僅 gameWins
export interface ApiCompletedEvent {
  startTime: string;
  blockName: string;
  league: { name: string };
  match: {
    id: string;
    type: string;
    teams: { name: string; code: string; image: string; result: { gameWins: number } }[];
    strategy: { type: string; count: number };
  };
  games: { id: string; vods: { parameter: string }[] }[];
}
export type GetCompletedEventsResponse = Envelope<{ schedule: { events: ApiCompletedEvent[] } }>;

// ---- getEventDetails ----
export interface ApiEventDetails {
  id: string;
  type: string;
  tournament: { id: string };
  league: { id: string; slug: string; image: string; name: string };
  match: {
    strategy: { count: number };
    teams: { id: string; name: string; code: string; image: string; result: { gameWins: number } }[];
    games: {
      number: number;
      id: string;
      state: "unstarted" | "inProgress" | "completed" | "unneeded" | string;
      teams: { id: string; side: "blue" | "red" | string }[];
      vods: unknown[];
    }[];
  };
  streams: unknown[];
}
export type GetEventDetailsResponse = Envelope<{ event: ApiEventDetails }>;

// ---- getTeams（id 參數可用逗號串多個 slug）----
export interface ApiTeam {
  id: string;
  slug: string;
  name: string;
  code: string;
  image: string;
  alternativeImage: string | null;
  backgroundImage: string | null;
  status: string;
  homeLeague: { name: string; region: string } | null;
}
export type GetTeamsResponse = Envelope<{ teams: ApiTeam[] }>;
