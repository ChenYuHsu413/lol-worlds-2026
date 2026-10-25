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
- **Play-In**：6 場依時間排成勝部首輪 ×2 → 第 3、4 場 → 敗部決賽 → 總決賽。籤表的每一格由「來源」決定（例如勝部決賽上格 = 勝部首輪 A 勝者，見 `lib/playin.ts` 的 `PLAYIN_SOURCES`），不依 API teams 的順序；比分依 team id 對應。淘汰賽也用同一套規則（`lib/bracket.ts`）。第 3、4 場要等隊伍填入後，才依「是勝部首輪的勝者還是敗者」判定哪場是勝部決賽、哪場是敗部首輪；判定之前顯示成「10/17 場次 A/B」。
- **淘汰賽**：依 match id 排序後切成各輪，四強第 i 場由八強第 2i-1、2i 場的勝者對戰（以 2025 資料驗證，規則寫在 `config/format-2026.ts`）。
- 合併資料、輪次推算、籤表推進只要有不一致，都會在伺服器端 `console.warn`。
- **抽籤規則檢查**：官方第一輪配對如果違反「第 1 池對第 4 池、第 2 池對第 3 池、同賽區不交手」，或八強籤表違反「兩支 3-0 分在兩側、對手為 3-2」，就會 `console.warn`。淘汰賽這兩條規則只有媒體報導當出處，見 `config/format-2026.ts`。

## 全部賽程

- 進入賽程頁（首次進入或從其他頁籤切回）時，直接定位到目標日期，日期標題接在頁籤正下方。目標日期依序是：今天（台灣日期）有比賽就是今天 → 否則下一個比賽日 → 全部打完就是最後一個比賽日；有套用隊伍篩選時只看該隊的場次（`lib/schedule.ts` 的 `getTargetDate`）。
- 資料自動更新不會捲動。從參賽隊伍頁點場次跳過來時，照舊捲到那一場。
- 圖片載入完成後會校正一次位置；使用者已經手動捲動過就不校正。
- 捲離目標日期超過一個螢幕高度時，右下角會出現「回到今天」按鈕。今天的日期標題會加上「今天」標籤。

## 瑞士輪分池與抽籤規則

瑞士輪 Tab 上方有可收合的「分池與抽籤規則」區塊（桌機預設展開、手機預設收合，手機上分池改成上下排列）。

- **分池**：依第 1～4 池分欄，顯示各隊的 logo、隊名、賽區和種子序。Play-In 勝隊產生前顯示「Play-In 勝隊」佔位卡，產生後自動填入第 4 池。
  - 出處：[LoL Esports《Worlds 2026 Primer》](https://lolesports.com/en-US/news/worlds-2026-primer)（官方稱 Tier）、[Leaguepedia Main Event](https://lol.fandom.com/wiki/2026_Season_World_Championship/Main_Event)。
  - 各隊所屬的池記錄在 `config/teams-2026.json`。
- **抽籤規則**：`config/format-2026.ts` 的 `SWISS_DRAW_RULES` 只收錄官方 Primer 原文有寫的規則，每條都附出處。
- **第一輪對戰**：公布後，兩隊會掛上同色的「R1-n vs 對手」標籤，並顯示 `checkRound1Draw` 的檢查結果；不符合規則時會列出違規的配對並 `console.warn`。
- **參賽隊伍頁**：直接晉級瑞士輪的隊伍卡會標示「第 n 池」，Play-In 隊伍不標示。
- **開發預覽**：`?fixture=synthetic-swiss-r1` 會顯示第一輪已公布的情境。

## 瑞士輪對戰圖（桌機 ≥ 768px）

- **戰績網格**：橫軸是輪次，縱軸依「勝場 − 敗場」對齊，勝敗差相同的桶在同一高度。晉級框放在產生它的桶的右上方，淘汰框放在右下方（位置計算見 `lib/swiss-grid.ts` 的 `swissGrid`）。
- **流向連線**：每個戰績桶畫兩條低對比細線，勝者往右上、敗者往右下。滑過或點選隊伍時，該隊走過的連線會高亮；點選後會固定，再點一次取消。
- **待抽籤**：還沒配對的桶列出已知會進這一桶的隊伍（目前戰績等於該桶、還沒排進對戰），其餘名額顯示空位（`pendingSeats`）。
- **晉級／淘汰框**：顯示名額（例如 3-0 有 2 個），名額由賽制模板推算（`resultCapacity`）；還沒產生的隊伍顯示空位圈。
- **戰績表**：瑞士輪頁上方可以切換「對戰圖 / 戰績表」，選擇存在 localStorage（`worlds:swissMode`），預設是對戰圖。表格一列一隊，欄位是 R1–R5（對手 logo + 勝/敗，Bo3 另外顯示比分；未打留空，進行中顯示 LIVE）、戰績和狀態。點對手會開小局面板，點隊名會套用隊伍篩選（`lib/swiss-table.ts`）。
  - 排序：勝場多優先，其次敗場少。官方 Primer 沒有寫同戰績的排名規則，所以同戰績依隊名排序，表格下方有註明。
- 手機版維持原本的輪次切換列表，沒有戰績表。

## 小局細節

點選已完賽或進行中的系列賽（賽程列表、籤表卡片、瑞士輪分桶都可以），就會開啟小局面板。面板以 Tab 切換 Game 1／2／…，Bo3／Bo5 另有 Fearless 頁。資料在展開時才向 `/api/games/[matchId]` 抓取。

| 資料來源 | 取得的內容 |
|---|---|
| LoL Esports `getEventDetails` | 每局的 gameId、局數、狀態、藍方／紅方 |
| [live stats feed](https://feed.lolesports.com/livestats/v1/window/{gameId}) `window` | 選手（`summonerName`、`esportsPlayerId`）、位置、英雄、版本；終局 frame 裡的 KDA、補刀、金錢、擊殺、塔、兵營、巴龍、龍 |
| Leaguepedia `Special:CargoExport`（ScoreboardGames × PicksAndBansS7） | 每局勝方、遊戲時長、10 個 Ban 位、20 步選角順序 |
| Riot Data Dragon | 最新版本（`versions.json`）、`zh_TW` 英雄官方譯名、英雄頭像；`en_US` 用來把 Leaguepedia 的英文名稱對應成英雄 id |

- **取得終局數據**：`window` 不帶 `startingTime` 時只回傳開局 frame；`startingTime` 帶在結束時間之後，就會回傳終局 frame（`gameState: finished`）。進行中的局則取 1 分鐘前的 frame。
- **對應 Leaguepedia 的局**：開局時間相差 45 分鐘內，而且藍方 5 隻英雄完全相同，才算同一局。
- **勝方**：以 Leaguepedia 為準。Leaguepedia 取不到時，依終局的兵營、塔、金錢推估，再用系列賽比分驗證；推估的總和和比分不符時就不顯示。用 2025 決賽 5 局驗證過，推估結果和實際完全一致。
- **選手對應**：先用 `esportsPlayerId` 對應「參賽隊伍」頁的選手，對不上再用去掉隊伍代碼前綴的名稱比對（「T1 Faker」→「Faker」）。對不上的選手只顯示名稱，不能點。
- **Fearless**：世界賽採全局 Fearless，系列賽中任一隊用過的英雄，之後的局數兩隊都不能再選。頁面以單一「已鎖定英雄池」依局數累加呈現，每個英雄標上使用隊伍的 logo 和局數；同一系列賽如果出現重複選用的英雄，代表資料比對有誤，會 `console.warn`。
- **快取**：進行中的局 30 秒。已完賽的局，只有勝方（Leaguepedia）和 Ban/Pick 都已取得，才會永久快取。欄位不完整的已完賽局每 10 分鐘重抓，直到資料完整；超過 24 小時仍不完整就停止重抓，改為快取 1 小時。
- **資料整理中**：已完賽 6 小時內缺少的欄位會顯示「資料整理中」，超過 6 小時才隱藏。
- **缺資料**：某局缺什麼就只隱藏那個欄位，不會讓整個面板報錯。
- **開發**：`?fixture=2025` 會改讀 `fixtures/games/`，其中包含 2025 決賽、八強 T1-AL、瑞士輪 VKS-TSW 三場。

## 已移除功能

- 預測模式（Pick'Ems 式推演）已封存於 tag `prediction-mode-archive`。

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
- `?fixture=synthetic-swiss-r1`：Play-In 打完，加上一組符合規則的瑞士輪第一輪對戰
- `?fixture=live-<名稱>`：`node --env-file=.env.local scripts/save-live.ts <名稱>` 存下的正式資料快照，存在 `fixtures/live/`

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
node scripts/check-games.ts
```

```bash
node --env-file=.env.local scripts/explore-games.ts
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
- Leaguepedia 的 `api.php` cargoquery 匿名查詢一直被限流，所以改用 `Special:CargoExport`。如果它也失效，Ban 位和選角順序會隱藏，勝方改為推估。
- live stats 的 `details` 端點另外有出裝、傷害占比等資料，本站沒有使用（KDA、補刀、金錢在 `window` 的終局 frame 已經有）。
- live stats 的隊伍擊殺數偶爾比選手擊殺加總多 1（例如 2026-10-16 MVK vs FUR G2：隊伍 21、選手加總 20、對手死亡加總 21），這是上游資料本身的差異；推測是沒有記到任何選手名下的擊殺（例如被小兵或防禦塔擊殺），網站照原樣顯示。
- 遊戲時長：有 Leaguepedia 時用它的數字；沒有時用 live stats 第一個到最後一個 frame 的時間差，和官方時長會差幾十秒。
- 2025 fixture 的選手名單是目前的名單，所以 2025 小局中，後來轉隊或離隊的選手（例如 Gumayusi、Flandre）對不上。
- **Leaguepedia 賽後補資料的延遲未量到**：2026-10-16 觀察到台灣 09:45 為止，MVK–FUR 三局（台灣 07:46、08:41、09:28 結束）都還沒補上 Ban/Pick 和勝方；KC–C9 五局（最後一局台灣 06:47 結束）在 08:58 已補齊，所以延遲最多約 2 小時 11 分，實際值不確定。未補上前，勝方依終局數據推估、Ban/選角順序顯示「資料整理中」。
- **feed 出現選手資料的時間只量到上限**：MVK–FUR G3 在 API 標成進行中後，feed 先回 204（推測是選角階段）；首個 frame 是台灣 09:01:25，09:13 已有 10 名選手，所以開打後最多約 12 分鐘內會有資料，更精確的延遲未量到。這段期間面板顯示「等待即時資料…」，有資料後自動更新。
- **CDN 快取秒數無法從瀏覽器直接確認**：Vercel 回給瀏覽器時會拿掉 `s-maxage`，只剩 `Cache-Control: public`。不完整時 600 秒可從 `Age` 推得（觀察到 HIT、`Age: 593`），永久快取未觀察到 `Age` 超過 600。
- **剛完賽局的結束時間有幾秒誤差**：開局未滿 4 小時的已完賽局，終局 frame 以「現在 − 1 分鐘」查詢，`endedAt` 每次可能差幾秒（例如 23:46:42 → 23:46:45），不影響顯示。
- 檢查方式改為手動：在需要的時間點執行 `node scripts/check-live.ts` 和 `node scripts/check-games.ts`，不做背景輪詢。
- 網站本身沒有使用 Riot / LoL Esports 的商標圖片；隊伍 logo 直接引用 API 提供的網址。
