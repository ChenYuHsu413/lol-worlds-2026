import type { Match } from "@/lib/types";

/** 該場是否有指定隊伍（隊伍篩選用） */
export const involves = (m: Match, teamId: string) => m.teamA?.id === teamId || m.teamB?.id === teamId;
