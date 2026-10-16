import { PLAYIN_SOURCES } from "@/lib/playin";
import type { PlayInSlot, PlayInSlotKey, PlayInView } from "@/lib/types";
import { BracketLines, type Line } from "./BracketLines";
import { CARD_H, CARD_W, MatchCard } from "./MatchCard";
import { MatchCardMobile } from "./MatchCardMobile";
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

// 進線：接到目標卡片的上格或下格（格位由來源決定）；出線：卡片右側中央
const into = (p: { x: number; y: number }, seat: number) => ({ x: p.x, y: p.y + (seat === 0 ? 36 : 71) });
const out = (p: { x: number; y: number }) => ({ x: p.x + CARD_W, y: p.y + CARD_H / 2 + 9 });

export function PlayInBracket({ view, focus }: { view: PlayInView; focus: string | null }) {
  return (
    <>
      <div className="hidden md:block">
        <PlayInDesktop view={view} focus={focus} />
      </div>
      <div className="md:hidden">
        <PlayInMobile view={view} focus={focus} />
      </div>
    </>
  );
}

// ---- 手機（< 768px）：依階段由上往下的列表，以文字標示勝敗去向 ----

function PlayInMobile({ view, focus }: { view: PlayInView; focus: string | null }) {
  const card = (s: PlayInSlot) => (
    <MatchCardMobile
      key={s.match.id}
      match={s.match}
      label={s.label}
      provisional={s.provisional}
      next={s.next || null}
      seats={s.seats}
      focus={focus}
    />
  );
  const sections: { title: string; slots: PlayInSlot[] }[] =
    view.slots.length === 6
      ? [
          { title: "勝部首輪", slots: view.slots.slice(0, 2) },
          { title: "勝部決賽 / 敗部首輪", slots: view.slots.slice(2, 4) },
          { title: "敗部決賽", slots: [view.slots[4]] },
          { title: "總決賽", slots: [view.slots[5]] },
        ]
      : [{ title: "Play-In", slots: view.slots }];

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="text-muted">晉級瑞士輪：</span>
        {view.qualified ? (
          <span className="inline-flex items-center gap-1.5 font-bold text-win">
            <TeamLogo team={view.qualified} size={18} /> {view.qualified.name}
          </span>
        ) : (
          <span className="text-muted">待定</span>
        )}
      </p>
      {sections.map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-1.5 text-xs font-bold text-accent">{sec.title}</h3>
          <div className="space-y-2">{sec.slots.map(card)}</div>
        </section>
      ))}
      {view.eliminated.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          淘汰：
          {view.eliminated.map((t) => (
            <span key={t.id} className="flex items-center gap-1 line-through">
              <TeamLogo team={t} size={14} /> {t.code}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ---- 桌機（≥ 768px）：SVG 連線籤表 ----

function PlayInDesktop({ view, focus }: { view: PlayInView; focus: string | null }) {
  const unknownLayout = view.slots.length !== 6;
  if (unknownLayout) {
    // 場數不符預期時退回簡單列表（lib/playin.ts 已 warn）
    return (
      <div className="flex flex-wrap gap-4">
        {view.slots.map((s) => (
          <div key={s.match.id} className="relative" style={{ width: CARD_W, height: CARD_H }}>
            <MatchCard match={s.match} label={s.label} provisional focus={focus} seats={s.seats} x={0} y={0} />
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

  // 連線依來源表（lib/playin.ts 的 PLAYIN_SOURCES）：從來源場次接到它對應的格；勝者實線、敗者虛線，來源完賽時高亮
  const posOf: Record<PlayInSlotKey, { x: number; y: number }> = {
    ub1a: POS.ub1a,
    ub1b: POS.ub1b,
    ubFinal: POS.midA,
    lbRound1: POS.midB,
    lbFinal: POS.lbFinal,
    grandFinal: POS.grandFinal,
  };
  const slotOf = (k: PlayInSlotKey) => placed.find((p) => p.slot.key === k)?.slot;
  const undetermined = (k: PlayInSlotKey) => !resolved && (k === "ubFinal" || k === "lbRound1");
  const lines: Line[] = (Object.entries(PLAYIN_SOURCES) as [PlayInSlotKey, NonNullable<(typeof PLAYIN_SOURCES)[PlayInSlotKey]>][])
    .filter(([target, srcs]) => !undetermined(target) && srcs.every((s) => !undetermined(s.from)))
    .flatMap(([target, srcs]) =>
      srcs.map((s, seat) => ({
        from: out(posOf[s.from]),
        to: into(posOf[target], seat),
        kind: s.take,
        active: slotOf(s.from)?.match.state === "completed",
      })),
    );

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
              seats={slot.seats}
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
