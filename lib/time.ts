// 所有顯示時間以 API 的 UTC startTime 轉為 Asia/Taipei
// 只用 Intl 取數字部件再自行組字串：伺服器（Node ICU）與瀏覽器的 zh-TW 格式字元可能不同，會造成 hydration mismatch

const TZ = "Asia/Taipei";
export const TZ_LABEL = "(UTC+8)";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function parts(iso: string) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const n = (k: string) => Number(p[k]);
  const y = n("year");
  const mo = n("month");
  const d = n("day");
  return { y, mo, d, h: n("hour") % 24, mi: n("minute"), s: n("second"), wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
}
const pad = (x: number) => String(x).padStart(2, "0");

/** 台灣日期 "YYYY-MM-DD"，用於分組 */
export const taipeiDateKey = (iso: string) => {
  const t = parts(iso);
  return `${t.y}-${pad(t.mo)}-${pad(t.d)}`;
};
/** "10/17" */
export const taipeiMonthDay = (iso: string) => {
  const t = parts(iso);
  return `${t.mo}/${t.d}`;
};
/** "10月17日（六）" */
export const taipeiDayHeading = (iso: string) => {
  const t = parts(iso);
  return `${t.mo}月${t.d}日（${WEEKDAYS[t.wd]}）`;
};
/** "02:00" */
export const taipeiTime = (iso: string) => {
  const t = parts(iso);
  return `${pad(t.h)}:${pad(t.mi)}`;
};
/** "10/17 02:00:00" */
export const taipeiDateTime = (iso: string) => {
  const t = parts(iso);
  return `${t.mo}/${t.d} ${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}`;
};
