import type { PlayInSlot, PlayInSlotKey, PlayInView } from "@/lib/types";
import { BracketLines, type Line } from "./BracketLines";
import { CARD_H, CARD_W, MatchCard } from "./MatchCard";
import { TeamLogo } from "./TeamLogo";

const COL = CARD_W + 56;
const TOP = 28;
const POS = {
  ub1a: { x: 0, y: TOP },
  ub1b: { x: 0, y: TOP + 120 },
  midA: { x: COL, y: TOP + 60 }, // 勝部決賽（或未判定的第 3 場）
  midB: { x: COL, y: TOP + 240 }, // 敗部首輪（或未判定的第 4 場）
  lbFinal: { x: COL * 2, y: TOP + 240 },
  grandFinal: { x: COL * 3, y: TOP + 150 },
};
const WIDTH = COL * 3 + CARD_W;
const HEIGHT = TOP + 240 + CARD_H + 8;
const HEADERS = ["勝部首輪", "勝部決賽 / 敗部首輪", "敗部決賽", "總決賽"];

const SOURCES: Partial<Record<PlayInSlotKey, [string, string]>> = {
  ubFinal: ["勝部首輪 A 勝者", "勝部首輪 B 勝者"],
  lbRound1: ["勝部首輪 A 敗者", "勝部首輪 B 敗者"],
  lbFinal: ["勝部決賽敗者", "敗部首輪勝者"],
  grandFinal: ["勝部決賽勝者", "敗部決賽勝者"],
};

// 卡片左側兩個隊伍列的高度位置、右側出線位置
const inA = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + 36 });
const inB = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + 71 });
const out = (p: { x: number; y: number }) => ({ x: p.x + CARD_W, y: p.y + CARD_H / 2 + 9 });

export function PlayInBracket({ view, focus }: { view: PlayInView; focus: string | null }) {
  const unknownLayout = view.slots.length !== 6;
  if (unknownLayout) {
    // 場數不符預期時退回簡單列表（lib/playin.ts 已 warn）
    return (
      <div className="flex flex-wrap gap-4">
        {view.slots.map((s) => (
          <div key={s.match.id} className="relative" style={{ width: CARD_W, height: CARD_H }}>
            <MatchCard match={s.match} label={s.label} provisional focus={focus} x={0} y={0} />
          </div>
        ))}
      </div>
    );
  }

  const [ub1a, ub1b, d2a, d2b, lbFinal, grandFinal] = view.slots;
  const resolved = !d2a.provisional && !d2b.provisional;
  const ubFinal = resolved ? (d2a.key === "ubFinal" ? d2a : d2b) : d2a;
  const lbRound1 = resolved ? (d2a.key === "lbRound1" ? d2a : d2b) : d2b;

  const placed: { slot: PlayInSlot; pos: { x: number; y: number } }[] = [
    { slot: ub1a, pos: POS.ub1a },
    { slot: ub1b, pos: POS.ub1b },
    { slot: ubFinal, pos: POS.midA },
    { slot: lbRound1, pos: POS.midB },
    { slot: lbFinal, pos: POS.lbFinal },
    { slot: grandFinal, pos: POS.grandFinal },
  ];

  const done = (s: PlayInSlot) => s.match.state === "completed";
  const lines: Line[] = [
    { from: out(POS.lbFinal), to: inB(POS.grandFinal), kind: "winner", active: done(lbFinal) },
  ];
  if (resolved) {
    lines.push(
      { from: out(POS.ub1a), to: inA(POS.midA), kind: "winner", active: done(ub1a) },
      { from: out(POS.ub1b), to: inB(POS.midA), kind: "winner", active: done(ub1b) },
      { from: out(POS.ub1a), to: inA(POS.midB), kind: "loser" },
      { from: out(POS.ub1b), to: inB(POS.midB), kind: "loser" },
      { from: out(POS.midA), to: inA(POS.lbFinal), kind: "loser" },
      { from: out(POS.midB), to: inB(POS.lbFinal), kind: "winner", active: done(lbRound1) },
      { from: out(POS.midA), to: inA(POS.grandFinal), kind: "winner", active: done(ubFinal) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
          {HEADERS.map((h, i) => (
            <div key={h} className="absolute text-xs font-bold text-accent" style={{ left: i * COL, top: 0, width: CARD_W }}>
              {h}
            </div>
          ))}
          <BracketLines lines={lines} width={WIDTH} height={HEIGHT} />
          {placed.map(({ slot, pos }) => (
            <MatchCard
              key={slot.match.id}
              match={slot.match}
              label={slot.label}
              provisional={slot.provisional}
              focus={focus}
              sourceLabels={slot.key ? SOURCES[slot.key] : null}
              x={pos.x}
              y={pos.y}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted">晉級瑞士輪：</span>
          {view.qualified ? (
            <span className="flex items-center gap-1.5 font-bold text-win">
              <TeamLogo team={view.qualified} /> {view.qualified.code}
            </span>
          ) : (
            <span className="text-muted">待定</span>
          )}
        </span>
        {view.eliminated.length > 0 && (
          <span className="flex items-center gap-2">
            <span className="text-muted">淘汰：</span>
            {view.eliminated.map((t) => (
              <span key={t.id} className="flex items-center gap-1 text-muted line-through">
                <TeamLogo team={t} size={16} /> {t.code}
              </span>
            ))}
          </span>
        )}
      </div>
      {!resolved && (
        <p className="text-xs text-muted">
          虛線框：資料未標示勝部/敗部，{d2a.label}、{d2b.label} 何者為勝部決賽，待勝部首輪結束、隊伍填入後自動判定。
        </p>
      )}
    </div>
  );
}
