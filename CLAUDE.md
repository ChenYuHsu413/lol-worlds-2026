## 機密檔案
- 不得以任何方式讀取 .env、.env.* 檔案的內容（包括 Read 工具、cat、type、Get-Content、Select-String、node/python 腳本等）
- 不得建立、修改、刪除 .env* 檔案；需要時說明原因並請使用者手動處理
- 執行會載入 .env.local 的程式（dev server、--env-file 的腳本）是允許的，但不得把環境變數的值印出或寫進任何檔案
- 任何工具被權限設定擋下時，一律停下來回報，不得改用其他工具或指令達成同樣目的
