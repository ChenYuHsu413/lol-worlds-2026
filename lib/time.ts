// 所有顯示時間以 API 的 UTC startTime 轉為 Asia/Taipei

const TZ = "Asia/Taipei";
export const TZ_LABEL = "(UTC+8)";

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const mdFmt = new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, month: "numeric", day: "numeric" });
const dayHeadFmt = new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" });
const timeFmt = new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const fullFmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: TZ,
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 台灣日期 "YYYY-MM-DD"，用於分組 */
export const taipeiDateKey = (iso: string) => dateKeyFmt.format(new Date(iso));
/** "10/17" */
export const taipeiMonthDay = (iso: string) => mdFmt.format(new Date(iso));
/** "10月17日 週六" */
export const taipeiDayHeading = (iso: string) => dayHeadFmt.format(new Date(iso));
/** "02:00" */
export const taipeiTime = (iso: string) => timeFmt.format(new Date(iso));
/** "10/17 02:00:00" */
export const taipeiDateTime = (iso: string) => fullFmt.format(new Date(iso));
