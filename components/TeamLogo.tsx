import type { Team } from "@/lib/types";

// 隊伍 logo 直接引用 API 提供的 URL（外部圖片、尺寸固定，不經 next/image 最佳化）
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
  // 一律墊深色圓角底：白色/淺色 logo 在亮色主題下才看得清楚
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-slate-800"
      style={{ width: size, height: size, padding: Math.max(1, Math.round(size / 10)) }}
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
