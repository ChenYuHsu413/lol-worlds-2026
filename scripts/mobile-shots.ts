/* eslint-disable @typescript-eslint/no-explicit-any -- CDP 回應為動態 JSON */
// 手機寬度逐頁截圖 + 橫向捲動檢查（不需額外套件：本機 Edge/Chrome headless + Chrome DevTools Protocol）
// 執行：node scripts/mobile-shots.ts <標籤> [網址]
//   例：node scripts/mobile-shots.ts before https://lol-worlds-2026.vercel.app
// 輸出：screenshots/<標籤>/<資料>-<寬度>-<頁面>.png 與 report.json（scrollWidth 檢查結果）

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const label = process.argv[2] ?? "shots";
const base = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
// 寬度可用環境變數覆寫，例如 SHOT_WIDTHS=1280 用來比對桌機版
const WIDTHS = (process.env.SHOT_WIDTHS ?? "360,390,430").split(",").map(Number);
const DATASETS = [
  { key: "live", query: "" },
  { key: "2025", query: "?fixture=2025" },
];
// 每頁的頁籤文字（改版前／改版後）
const PAGES: { key: string; tabs: string[] }[] = [
  { key: "playin", tabs: ["Play-In"] },
  { key: "swiss", tabs: ["瑞士輪"] },
  { key: "knockout", tabs: ["淘汰賽"] },
  { key: "schedule", tabs: ["全部賽程", "賽程"] },
  { key: "teams", tabs: ["參賽隊伍", "隊伍"] },
  { key: "games", tabs: ["淘汰賽"] }, // 開啟決賽的小局面板
];
const OUT = path.join(process.cwd(), "screenshots", label);
const PORT = 9333;

const browser = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
if (!browser) throw new Error("找不到 Edge/Chrome");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const profile = await mkdtemp(path.join(tmpdir(), "mobile-shots-"));
  const proc = spawn(browser!, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--hide-scrollbars",
    "about:blank",
  ]);

  let wsUrl = "";
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      wsUrl = list.find((t: any) => t.type === "page")?.webSocketDebuggerUrl ?? "";
    } catch {}
  }
  if (!wsUrl) throw new Error("無法連上 headless 瀏覽器");

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method: string, params: any = {}) =>
    new Promise<any>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expr: string) =>
    (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  const report: any[] = [];
  for (const ds of DATASETS) {
    for (const width of WIDTHS) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
      for (const page of PAGES) {
        await send("Page.navigate", { url: `${base}/${ds.query}` });
        for (let i = 0; i < 50; i++) {
          await sleep(200);
          if ((await evaluate("document.readyState")) === "complete") break;
        }
        await sleep(2500); // 等 hydration
        const clicked = await evaluate(`(() => {
          const names = ${JSON.stringify(page.tabs)};
          const tab = [...document.querySelectorAll('[role=tab]')].find(t => t.offsetParent !== null && names.some(n => t.textContent.trim().startsWith(n)));
          tab?.click();
          return !!tab;
        })()`);
        await sleep(600);
        let note = clicked ? "" : "找不到頁籤";
        if (page.key === "games") {
          const opened = await evaluate(`(() => {
            const el = [...document.querySelectorAll('[title="查看小局細節"]')].find(e => e.offsetParent !== null && e.textContent.includes('決賽'));
            el?.click();
            return !!el;
          })()`);
          if (!opened) {
            note = "沒有已完賽的決賽可開啟";
            report.push({ dataset: ds.key, width, page: page.key, skipped: note });
            continue;
          }
          await sleep(3500);
        }
        // 整頁橫向捲動 + 內層需要左右滑動的容器（overflow-x: auto/scroll 且內容超出）
        const m = await evaluate(`({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
          h: document.documentElement.scrollHeight,
          inner: [...document.querySelectorAll('body *')].filter(e => {
            const ox = getComputedStyle(e).overflowX;
            return (ox === 'auto' || ox === 'scroll') && e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1;
          }).map(e => e.tagName.toLowerCase() + (e.getAttribute('role') ? '[role=' + e.getAttribute('role') + ']' : '') + ' ' + e.scrollWidth + '>' + e.clientWidth),
        })`);
        const full = page.key !== "games";
        const shot = await send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: full,
          clip: { x: 0, y: 0, width, height: full ? Math.min(m.h, 9000) : 800, scale: 1 },
        });
        const file = `${ds.key}-${width}-${page.key}.png`;
        await writeFile(path.join(OUT, file), Buffer.from(shot.result.data, "base64"));
        report.push({ dataset: ds.key, width, page: page.key, file, scrollWidth: m.sw, clientWidth: m.cw, overflow: m.sw > m.cw, innerScroll: m.inner, note });
        console.log(
          `${file}  頁面 ${m.sw}/${m.cw}${m.sw > m.cw ? " ← 整頁橫向捲動" : ""}` +
            `${m.inner.length ? "  內層橫向捲動：" + m.inner.join(", ") : ""}${note ? "  " + note : ""}`,
        );
      }
    }
  }
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  const shots = report.filter((r) => r.file);
  console.log(
    `\n共 ${shots.length} 張；整頁橫向捲動 ${shots.filter((r) => r.overflow).length} 張；` +
      `有內層橫向捲動 ${shots.filter((r) => r.innerScroll.length).length} 張；略過 ${report.length - shots.length} 項`,
  );
  ws.close();
  proc.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
