import type { KnockoutView } from "@/lib/types";
import { winnerOf } from "@/lib/playin";
import { BracketLines, targetRow, type Line } from "./BracketLines";
import { CARD_H, CARD_W, MatchCard } from "./MatchCard";
import { MatchCardMobile } from "./MatchCardMobile";
import { TeamLogo } from "./TeamLogo";

const COL = CARD_W + 56;
const TOP = 28;
const ROW = CARD_H + 24;

const pos = (round: number, index: number) => {
  const span = 2 ** round;
  return { x: round * COL, y: TOP + (index * span + (span - 1) / 2) * ROW };
};

export function KnockoutBracket({ view, focus }: { view: KnockoutView; focus: string | null }) {
  return (
    <>
      <div className="hidden md:block">
        <KnockoutDesktop view={view} focus={focus} />
      </div>
      <div className="md:hidden">
        <KnockoutMobile view={view} focus={focus} />
      </div>
    </>
  );
}

// ---- 手機（< 768px）：依輪次分段，以文字標示勝者去向 ----

// 「八強賽」→「八強」、「四強賽」→「四強」；「決賽」維持原樣
const shortRound = (name: string) => name.replace(/強賽$/, "強");

function KnockoutMobile({ view, focus }: { view: KnockoutView; focus: string | null }) {
  if (!view.rounds[0]?.length) return <p className="text-muted">尚無淘汰賽資料</p>;
  const final = view.rounds.at(-1)?.[0];
  const champion = winnerOf(final?.match);
  const last = view.rounds.length - 1;
  return (
    <div className="space-y-4">
      {champion && (
        <p className="flex items-center gap-2 rounded-lg border border-accent bg-accent/15 px-3 py-2 font-bold text-accent">
          冠軍 <TeamLogo team={champion} size={22} /> {champion.name}
        </p>
      )}
      {view.rounds.map((round, r) => {
        const name = shortRound(view.roundNames[r]);
        const nextName = r < last ? shortRound(view.roundNames[r + 1]) : null;
        return (
          <section key={r}>
            <h3 className="mb-1.5 text-xs font-bold text-accent">{view.roundNames[r]}</h3>
            <div className="space-y-2">
              {round.map((slot) => (
                <MatchCardMobile
                  key={slot.match.id}
                  match={slot.match}
                  label={round.length > 1 ? `${name} ${slot.index + 1}` : name}
                  sourceLabels={
                    r === 0
                      ? null
                      : [`${shortRound(view.roundNames[r - 1])} ${slot.index * 2 + 1} 勝者`, `${shortRound(view.roundNames[r - 1])} ${slot.index * 2 + 2} 勝者`]
                  }
                  next={
                    nextName
                      ? `勝者 → ${nextName}${view.rounds[r + 1].length > 1 ? `第 ${Math.floor(slot.index / 2) + 1} 場` : ""}`
                      : "勝者奪冠"
                  }
                  focus={focus}
                />
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-[11px] text-muted">籤表位置依官方場次順序推得（以 2025 資料驗證）。</p>
    </div>
  );
}

// ---- 桌機（≥ 768px）：SVG 連線籤表 ----

function KnockoutDesktop({ view, focus }: { view: KnockoutView; focus: string | null }) {
  const first = view.rounds[0]?.length ?? 0;
  if (first === 0) return <p className="text-muted">尚無淘汰賽資料</p>;

  const width = view.rounds.length * COL + CARD_W;
  const height = TOP + first * ROW;
  const final = view.rounds[view.rounds.length - 1]?.[0];
  const champion = winnerOf(final?.match);

  const lines: Line[] = [];
  view.rounds.forEach((round, r) => {
    if (r === 0) return;
    for (const slot of round) {
      const to = pos(r, slot.index);
      [0, 1].forEach((k) => {
        const feeder = view.rounds[r - 1][slot.index * 2 + k];
        if (!feeder) return;
        const from = pos(r - 1, feeder.index);
        const row = targetRow(winnerOf(feeder.match), slot.match, k as 0 | 1);
        lines.push({
          from: { x: from.x + CARD_W, y: from.y + CARD_H / 2 + 9 },
          to: { x: to.x, y: to.y + (row === 0 ? 36 : 71) },
          kind: "winner",
          active: feeder.match.state === "completed",
        });
      });
    }
  });

  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="relative" style={{ width, height }}>
          {view.roundNames.map((name, r) => (
            <div key={name} className="absolute text-xs font-bold text-accent" style={{ left: r * COL, top: 0 }}>
              {name}
            </div>
          ))}
          <div className="absolute text-xs font-bold text-accent" style={{ left: view.rounds.length * COL, top: 0 }}>
            冠軍
          </div>
          <BracketLines lines={lines} width={width} height={height} />
          {view.rounds.flatMap((round, r) =>
            round.map((slot) => {
              const p = pos(r, slot.index);
              return (
                <MatchCard
                  key={slot.match.id}
                  match={slot.match}
                  label={`${view.roundNames[r]}${round.length > 1 ? ` ${slot.index + 1}` : ""}`}
                  focus={focus}
                  sourceLabels={slot.sourceLabels}
                  x={p.x}
                  y={p.y}
                />
              );
            }),
          )}
          {final && (
            <div
              className={`absolute flex items-center gap-2 rounded-md border px-3 ${
                champion ? "border-accent bg-accent/15 font-bold text-accent" : "border-dashed border-line text-muted"
              }`}
              style={{ left: view.rounds.length * COL, top: pos(view.rounds.length - 1, 0).y + CARD_H / 2 - 22, height: 44, width: CARD_W - 40 }}
            >
              {champion ? (
                <>
                  <TeamLogo team={champion} size={24} /> {champion.code}
                </>
              ) : (
                "TBD"
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">籤表位置依官方場次順序推得（以 2025 資料驗證：四強第 i 場由八強第 2i-1、2i 場勝者對戰）。</p>
    </div>
  );
}
