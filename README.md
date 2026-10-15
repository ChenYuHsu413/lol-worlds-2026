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
| ↳ `getTeams` | 隊伍所屬地區、選手名單與照片（`players` 是整個組織的名單，含二軍；快取 1 小時） |
| `config/teams-2026.json`（手動維護） | 種子序、起始階段、世界賽登錄名單，取自 Leaguepedia 的 [Main Event](https://lol.fandom.com/wiki/2026_Season_World_Championship/Main_Event) 和 [Play-In](https://lol.fandom.com/wiki/2026_Season_World_Championship/Play-In) 頁面 |

Leaguepedia Cargo API 匿名查詢會被限流（實測連續兩次都回 `ratelimited`），所以改成手動維護設定檔，每筆都附 `source` 網址。選手名單的處理方式：用登錄名單過濾 `getTeams` 的組織名單，照片取自 `getTeams`；登錄名單裡有、API 卻找不到的選手仍會顯示，只是沒有照片。

各端點的實際回應存在 `fixtures/`，由 `scripts/explore-api.ts` 產生；型別定義在 `lib/api-types.ts`，是照實際結構寫的。

### 賽制如何推算（API 沒有提供的部分）

- **瑞士輪**：把已完賽的場次依 startTime 排序，逐場累計每隊的賽前戰績，算出每場的輪次和戰績桶。隊伍還是 TBD 的場次，就依「同一輪內 match id 排序 = 戰績桶由高到低」先擺上位置，標成 provisional（畫面上是虛線框）。這條規則已用 2025 全部 33 場驗證過。
- **Play-In**：6 場依時間排成勝部首輪 ×2 → 第 3、4 場 → 敗部決賽 → 總決賽。第 3、4 場要等隊伍填入後，才依「是勝部首輪的勝者還是敗者」判定哪場是勝部決賽、哪場是敗部首輪；判定之前顯示成「10/17 場次 A/B」。
- **淘汰賽**：依 match id 排序後切成各輪，四強第 i 場由八強第 2i-1、2i 場的勝者對戰（以 2025 資料驗證，規則寫在 `config/format-2026.ts`）。
- 合併資料、輪次推算、籤表推進只要有不一致，都會在伺服器端 `console.warn`。

## 預測模式

頁面頂部可以切換「實際結果／我的預測」。在預測模式下，點選尚未開打、雙方都已確定的比賽，就能選勝隊；Bo3／Bo5 可以再選比分。每次點選後，Play-In、瑞士輪、淘汰賽、參賽隊伍頁都會即時重算，一路推演到「預測冠軍」。推演邏輯在 `lib/simulate.ts`（純函式），推演完的比賽清單交給 `lib/views.ts`，沿用既有的瑞士輪／Play-In／淘汰賽邏輯來重建視圖。

推演規則：

- **已完賽的比賽**：一律鎖定為實際結果。如果使用者先前的預測和實際結果不同，或官方公布的對戰隊伍和預測不符，就標示「已被實際結果覆蓋」；猜錯的場次仍會計入命中率（已完賽場次中猜對的比例）。
- **Play-In**：沿用雙敗結構推進。第 3、4 場還無法判定時，暫時把時間較早的那場當成勝部決賽。
- **瑞士輪後續配對**：官方已公布的對戰一律照官方。其餘場次在同戰績的隊伍間抽籤，不得重複交手，抽不出合法組合時會回溯重抽。第一輪另外套用分池（第 1 池對第 4 池、第 2 池對第 3 池）和同賽區不交手的限制，分池資料記在 `config/teams-2026.json`。**同賽區限制只套用在第一輪**；第二輪以後只檢查同戰績和不重複交手。抽籤用 seed 固定結果，按「重新抽籤」會換 seed。
- **手動配對**：進入「調整配對／排籤」後，依序點兩支隊伍即可交換（桌機也可以拖曳）。只能交換推演抽出的場次；同輪同戰績的隊伍之間才能換，而且不得重複交手。
- **淘汰賽抽籤**：兩支 3-0 隊伍各對一支 3-2 隊伍，而且分在籤表兩側（八強 1、八強 3），其餘四隊隨機。**沒有找到官方 2026 規則書原文**，這條規則是依媒體報導（[Insider Gaming](https://insider-gaming.com/when-will-all-the-lol-worlds-2026-draws-take-place/)、[Inven Global](https://www.invenglobal.com/articles/26835/2026-lol-world-championship-kicks-off-october-16)）實作，其餘位置讓使用者自己手動排籤。**淘汰賽只鎖定這兩條有出處的規則**（3-0 對 3-2、兩支 3-0 分在兩側），其他像同賽區迴避這類限制都沒有套用。
- **Bo 數**：以 API 資料為準；資料缺 Bo 數時才用 `config/format-2026.ts` 的 `BEST_OF` 規則。
- **保存**：預測存在 localStorage，所有讀寫都包在 try/catch 裡，讀不到時頁面照常運作。「分享預測」會把狀態用 deflate 壓縮後轉成 base64url 放在 URL hash（`#p=…`），不放 query string；開啟分享連結時會優先套用連結內容。
- **猜錯的預測不會刪除**：已完賽場次的預測，會保留並標示「已被實際結果覆蓋」，仍計入命中率，但不再套用到推演裡。
- **上游改動的連鎖移除**：上游預測或配對改變後，下游對不上隊伍的預測會被移除，並出現提示「已移除 N 筆受影響的後續預測」，約 8 秒內可以按「復原」回到改動前的完整狀態。如果是實際結果更新造成的，只會提示，沒有復原。

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
node scripts/check-live.ts
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
- `config/teams-2026.json` 是手動維護的；世界賽期間如果有登錄名單異動，要自己更新。Leaguepedia 沒有標示替補（例如 BLG 登錄了兩名上路 Bin、Flandre），所以目前沒有任何選手被標成替補。
- 2025 fixture 的選手名單是 `getTeams` 目前的名單，不是 2025 當時的陣容。
- 預測模式中，瑞士輪第二輪以後的配對和八強籤表都是模擬抽籤，不是官方結果。
- 網站本身沒有使用 Riot / LoL Esports 的商標圖片；隊伍 logo 直接引用 API 提供的網址。
