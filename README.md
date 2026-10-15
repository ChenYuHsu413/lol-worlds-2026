# Worlds 2026 視覺化

用一個單頁網站呈現英雄聯盟 2026 世界賽的 Play-In 雙敗籤表、瑞士輪分桶圖、淘汰賽籤表和全部賽程。所有時間都以台灣時間 (UTC+8) 顯示。

- 正式站：https://lol-worlds-2026.vercel.app
- 技術：Next.js 15（App Router）、TypeScript、Tailwind CSS v4、vitest；籤表連線用 SVG 自己畫，沒有引入 bracket 函式庫

## 資料來源

| 來源 | 用途 |
|---|---|
| LoL Esports 非官方 API `https://esports-api.lolesports.com/persisted/gw/` | 主要資料來源 |
| ↳ `getLeagues` → `getTournamentsForLeague` | 找出 Worlds（leagueId `98767975604431411`）和 `worlds_2026`（tournamentId `115660540725177488`） |
| ↳ `getStandings` | 各階段的場次、team id、比分、勝負 |
| ↳ `getSchedule` | 開賽時間、Bo 數、階段名稱（和 standings 以 match id 合併） |
| ↳ `getTeams` | 隊伍所屬地區（`homeLeague.region`） |

Leaguepedia 目前還不需要用到，所以沒有串接。

各端點的實際回應存在 `fixtures/`，由 `scripts/explore-api.ts` 產生；型別定義在 `lib/api-types.ts`，是照實際結構寫的。

### 賽制如何推算（API 沒有提供的部分）

- **瑞士輪**：把已完賽的場次依 startTime 排序，逐場累計每隊的賽前戰績，算出每場的輪次和戰績桶。隊伍還是 TBD 的場次，就依「同一輪內 match id 排序 = 戰績桶由高到低」先擺上位置，標成 provisional（畫面上是虛線框）。這條規則已用 2025 全部 33 場驗證過。
- **Play-In**：6 場依時間排成勝部首輪 ×2 → 第 3、4 場 → 敗部決賽 → 總決賽。第 3、4 場要等隊伍填入後，才依「是勝部首輪的勝者還是敗者」判定哪場是勝部決賽、哪場是敗部首輪；判定之前顯示成「10/17 場次 A/B」。
- **淘汰賽**：依 match id 排序後切成各輪，四強第 i 場由八強第 2i-1、2i 場的勝者對戰（以 2025 資料驗證，規則寫在 `config/format-2026.ts`）。
- 合併資料、輪次推算、籤表推進只要有不一致，都會在伺服器端 `console.warn`。

## 本機啟動

需要 Node.js 24（`package.json` 的 `engines.node` 設為 `24.x`）。

```bash
npm install
```

複製 `.env.example` 成 `.env.local`（`next dev` 會自動讀取）：

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

開發模式下，可以用網址參數切換成 fixtures 資料預覽（production 會忽略這個參數）：

- `?fixture=2025`：2025 完整資料（瑞士輪、淘汰賽都已打完）
- `?fixture=synthetic-playin-none`、`-r1`、`-lbfinal`、`-done`：Play-In 合成情境

其他指令：

```bash
npm test
```

```bash
npm run build
```

```bash
node --env-file=.env.local scripts/explore-api.ts
```

```bash
node scripts/make-synthetic.ts
```

`scripts/*.ts` 由 Node 24 原生的 type stripping 直接執行，不需要 tsx。所以裡面只能用可以被直接移除的 TS 語法：**不能用 `enum`、`namespace`、constructor parameter properties**。

## API 金鑰

`x-api-key` 是 lolesports.com 前端用的公開金鑰，不是個人憑證。

### 金鑰失效時

API 回傳 401/403 時，頁面頂部會出現「資料來源金鑰失效」橫幅，並繼續顯示最後一次成功取得的資料。更換方式：

1. 用瀏覽器打開 https://lolesports.com ，開啟 DevTools → Network。
2. 篩選 `esports-api.lolesports.com` 的請求，從 Request Headers 複製 `x-api-key` 的值。（新版網站的 bundle 已經不直接包含金鑰，要從實際的請求中找。）
3. 更新本機的 `.env.local`，以及 Vercel 的環境變數（見下一節），然後重新部署。

## 部署到 Vercel

```bash
npx vercel login
```

```bash
npx vercel link --project lol-worlds-2026
```

```bash
npx vercel env add ESPORTS_API_KEY production
```

```bash
npx vercel deploy --prod
```

- Vercel 專案的 Node.js 版本要設成 24.x，和 `engines` 一致。
- 快取：上游 fetch 用 Next.js 的 `revalidate`；`/api/worlds` 的 `s-maxage` 在比賽進行中（或開賽前 15 分鐘到預估結束之間）是 60 秒，平時是 600 秒。前端也依同樣的間隔輪詢。

## 錯誤處理

- 金鑰失效、斷網或上游錯誤時不會白屏。頁面會顯示錯誤橫幅、「最後更新時間」和最後一次成功的資料；這份資料保存在伺服器 instance 記憶體，以及瀏覽器的 localStorage。
- 還沒有任何資料時，會顯示錯誤訊息和「重試」按鈕。

## 已知限制

- 這是非官方 API，欄位和金鑰隨時可能變動。
- 瑞士輪中隊伍還沒定的場次，位置是依 id 規則推測的；Play-In 第 3、4 場在隊伍填入前無法判定。
- `getStandings` 的瑞士輪 `rankings` 是空的，所以改用 `getSchedule` 的 `team.record` 交叉比對戰績。
- 「最後成功資料」的伺服器端快取只存在同一個 serverless instance 裡；冷啟動時如果剛好失敗，就只能靠瀏覽器 localStorage 的資料。
- 網站本身沒有使用 Riot / LoL Esports 的商標圖片；隊伍 logo 直接引用 API 提供的網址。
