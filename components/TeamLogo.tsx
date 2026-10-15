import type { Team } from "@/lib/types";

/** 「LCK 3 號種子」；無種子序時只顯示賽區 */
export const seedLabel = (team: Team) =>
  [team.league, team.seed !== null ? `${team.seed} 號種子` : null].filter(Boolean).join(" ");

// 隊伍 logo 直接引用 API 提供的 URL（外部圖片、尺寸固定，不經 next/image 最佳化）
// hover 顯示 tooltip：隊名 + 賽區 + 種子序
export function TeamLogo({ team, size = 20 }: { team: Team | null; size?: number }) {
  if (!team) {
    return (
      <span
        className="inline-block shrink-0 rounded-full border border-dashed border-line"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  const seed = seedLabel(team);
  // 一律墊深色圓角底：白色/淺色 logo 在亮色主題下才看得清楚
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-slate-800"
      style={{ width: size, height: size, padding: Math.max(1, Math.round(size / 10)) }}
      title={seed ? `${team.name}・${seed}` : team.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={team.logo} alt="" loading="lazy" className="h-full w-full object-contain" />
    </span>
  );
}

export function TeamName({ team, fallback = "TBD" }: { team: Team | null; fallback?: string }) {
  return (
    <span className={team ? "font-semibold" : "text-muted"} title={team?.name}>
      {team?.code ?? fallback}
    </span>
  );
}
