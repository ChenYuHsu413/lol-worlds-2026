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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={team.logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export function TeamName({ team, fallback = "TBD" }: { team: Team | null; fallback?: string }) {
  return (
    <span className={team ? "font-semibold" : "text-muted"} title={team?.name}>
      {team?.code ?? fallback}
    </span>
  );
}
