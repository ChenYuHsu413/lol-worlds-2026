"use client";

import { createContext, useContext } from "react";
import type { Match } from "@/lib/types";

/** 開啟系列賽的小局細節面板 */
export const GamesContext = createContext<(matchId: string) => void>(() => {});
export const useOpenGames = () => useContext(GamesContext);

/** 已開打的比賽才有小局資料 */
export const hasGames = (m: Match) => m.state === "completed" || m.state === "inProgress";
