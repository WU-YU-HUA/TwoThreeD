# 第一階段驗證紀錄

日期：2026-11-15。環境：macOS、本機 Python 靜態伺服器、Codex 內建瀏覽器。

本文件按開發階段保留歷史紀錄；最新狀態以最後一節及 SPEC §0 為準。

## 已完成

- 本機 `http://127.0.0.1:8765/` 回應 HTTP 200，工作台、選檔入口與預覽區可操作。
- DXF 範例讀取：19 個原始圖元，14 條預覽路徑、5 個文字物件；單位顯示毫米。內容面板列出 ARC 1、CIRCLE 1、LINE 4、LWPOLYLINE 8、TEXT 5，與人工建立的 fixture 相符。
- 實際使用者 PDF：成功經選檔入口讀取專案根目錄的平面規劃圖；顯示 1 頁、約 145.4 KB、紙張 420.2 × 297 mm。圖面可見，內嵌中文文字可擷取。
- 多頁 PDF `fixtures/two-pages.pdf`：顯示 2 頁，切換至第 2 頁後顯示 141.1 × 211.7 mm；內容面板顯示 `PAGE TWO` 及 `Portrait page - 400 x 600 pt`。
- PDF 旋轉及放大按鈕可操作；縮放比例和畫面隨操作更新。
- 無效 PDF `fixtures/invalid.pdf`：顯示「檔案內容不是有效的 PDF」，回到可重新選檔狀態。
- JavaScript 兩個模組通過 Node `--check`；Python 靜態伺服器通過 AST 語法解析。
- 讀取有效 PDF / DXF 的瀏覽器紀錄中未觀察到錯誤或警告；無效檔案測試的錯誤為預期結果。

## 尚未涵蓋

- 所有 CAD 廠牌、圖元與編碼組合；複雜 DXF 的完整呈現不在第一版承諾範圍。
- 所有瀏覽器與手機觸控組合；本次以實際本機內建瀏覽器驗證。
- OCR、比例校正、FloorPlan2D / Scene3D Schema、語意辨識、3D 幾何、DAE 匯出與 SketchUp 匯入，屬後續第 4–7 項。

原始使用者 PDF 不複製進 `web/` 或測試 fixtures；僅經本機檔案選擇器讀入。

## 主要圖面更新驗證

- 實際 PDF 包含 12 個 Optional Content Groups，已排除「圖框」；自動選區來自 8 類相關圖層的向量範圍，未硬編碼檔案座標。
- 預設畫面只顯示中央平面圖；完整原圖切換後仍可看到頁框和下方標題欄。手動拖曳選區可重新裁切預覽。
- 物件面板顯示活動家具、木作、原有牆、平面地坪、窗、門、廚具設備、鐵件；列出會議區／辦公區／茶水間，以及選區內的家具設備標示。
- 檢查到「新做OA辦公家具」4 處、「印表機」3 處；清單明示這是標示次數，未冒充實體計數。
- 新介面已取代初版的全頁文字面板，物件清單不包含公司、設計師、日期、圖號等資訊。
- `check-plan-analysis.mjs` 通過：圖層定位、圖框排除、標示篩選、縮小至茶水間選區後排除辦公家具、0/90/180/270 度座標往返，以及矩陣變換。
- Node 中解析 PDF.js 的 modern build 會提示建議 legacy build；實際瀏覽器預覽沒有錯誤，網站使用的仍是瀏覽器 build。

## JSON 檢視輸出驗證

- 3 份輸出 JSON 均可重新解析，來源 SHA-256 一致，2D 摘要引用的向量附檔與 1371 條路徑數相符。
- 2D 包含 8 類物件圖層及 1 個結構填線輔助圖層、29 處相關文字標示；未包含圖框公司／日期／設計師資料。
- 所有輸出 ID 唯一，路徑的圖層參照存在；move/line/cubic/close 指令參數數量正確，座標為有限數字。
- 比例仍未確認，毫米比例與來源到模型矩陣為 null；外牆參考 200 mm、牆高預設 2500 mm 已寫入。
- 3D 規劃明示 `actual_scene3d = null`、不可正式匯出；12 個示例節點與原 PDF 分離。
- 示意網格通過面索引、材質參照、每條邊兩面相接、正體積及 source→node 對應檢查。5000 mm 示例牆高 2500 mm，保留 900 × 2100 mm 真實空門洞。
- `check-plan-analysis.mjs` 再次通過，新增的可選向量輸出不改變既有預覽結果。
- 未執行正式 FloorPlan2D／Scene3D JSON Schema 或 SketchUp 匯入驗收；這些契約與管線仍待實作。

## Service 拆分與 3D 預覽驗證（2026-11-15）

- 五個獨立入口已建立：Reader、Extraction、Transfer、Preview、Export。網頁讀檔／萃取與 CLI 檢視輸出實際使用這些 service；3D 顯示只存在於 `preview-service.js`。
- `check-services.mjs` 通過：副檔名／空檔／超限／無效 PDF／二進位 DXF、DXF 19 圖元與 14 路徑／5 文字、PDF 主要範圍、手動茶水間範圍，以及資源釋放。
- 三份 JSON 經 service 重產生後，與原輸出深度比較一致，包含來源雜湊、1371 路徑、29 處標示、8 個規劃群組與所有穩定 ID。
- `check-plan-analysis.mjs` 通過，主圖、圖框排除及旋轉座標沒有回歸。
- `check-scene-preview.mjs` 通過：12 節點／10 網格、毫米與 Z 向上邊界、父層不重複位移、不修改輸入 JSON、凹多邊形面積與正反向環繞、非法索引／材質參照／群組循環拒絕。
- 本機瀏覽器實測 PDF 選檔、物件清單、完整圖／主圖切換及旋轉；無效 PDF 顯示錯誤且可繼續載入 DXF 範例。
- 3D 畫面實際顯示牆、真實門洞、地板、椅子與光影；拖曳旋轉、滾輪縮放、重設視角可操作。
- PNG 透過 Blob 下載成功；瀏覽器回傳實際下載路徑 `~/Downloads/twothreeD-format-example.png`，已驗證 PNG 格式與尺寸。
- 完成畫面截圖：`.local/scene-preview.jpg`。Three.js 預覽無觀察到瀏覽器錯誤／警告。
- JavaScript 模組語法檢查通過；正式 Transfer／DAE 入口明確回傳失敗，沒有宣稱已生成真實模型。
- 未驗證：正式 IR Schema、原圖自動辨識與轉 3D、貼圖、DAE 或 Windows SketchUp 手動驗收。未部署 GitHub Pages。

## 實際圖面轉換與分頁狀態驗證（2026-11-15）

- 使用者確認預設：來源圖面左上候選牆厚 200 mm、牆高 2500 mm、門高 2100 mm、窗台高 900 mm、窗高 1200 mm。預設集中於 `model-defaults.js`；門窗位置尚未辨識，尺寸先保留在 2D 初稿。
- `check-model-pipeline.mjs` 通過：實際 PDF 配對 5 面候選牆、DXF fixture 配對 7 面；從本次讀入的向量生成 FloorPlan2D，再經 Transfer 產生 Scene3D，最後交給 Preview 建立網格。確認來源雜湊、穩定 ID、選區、左上參考牆及各牆厚度比例。
- PDF 參考牆線距為 9.72 來源單位；5 面候選牆厚約為 200、200、160.49、202.47、202.47 mm，牆高均為 2500 mm。產物位於 `outputs/model-preview/`，不包含示例家具或虛構地板。
- `check-transfer.mjs` 通過：Schema、失敗阻擋、矩形門窗真實空洞、封閉網格與精確體積、地板孔洞、任意牆方向、樓層高度、不重複套用比例矩陣、來源對應、輸入不可變及可重現輸出。
- `validate_contracts.py` 通過：四份範例符合預編譯 Ajv Schema；不相容版本拒絕。11 個 `web/js/` JavaScript 模組通過語法檢查。
- 既有 `check-services.mjs`、`check-plan-analysis.mjs`、`check-scene-preview.mjs` 通過；舊診斷輸出仍可重現。固定格式示例只作測試 fixture，不再載入工作台。
- 瀏覽器實測：初始及讀檔後 3D TAB 反灰；選定左上候選牆、20 cm／250 cm 後按轉換，顯示原 PDF 名稱與 5 面牆，TAB 啟用並自動切換。修改牆高會讓舊模型失效；還原並重轉成功。
- 換成無牆的 `two-pages.pdf` 後，舊模型清除、回到 2D、3D TAB 及轉換按鈕停用，顯示找不到參考牆的原因；重新載入原 PDF 後可正常重轉。
- 瀏覽器下載 `scene3d.preview (1).json` 成功，與 CLI 針對同一 PDF 產生的 Scene3D 完全一致；PNG 下載成功，1094 × 860 像素。
- 新實際模型畫面保存於 `.local/converted-wall-preview.jpg`；本次瀏覽器驗證未觀察到 error／warn 紀錄。
- 邊界：自動流程目前只產生候選牆，仍有未配對線與待辨識門窗／地板／柱體／家具。預設尺寸已提供，但牆邊線配對未人工核對，故保持 `preview_only = true`，正式 Export 以 `E_PREVIEW_ONLY` 拒絕。
- 未完成／未驗證：完整語意萃取與校正、miter 牆角、曲線牆、家具模板、貼圖、DAE 下載及 Windows SketchUp 匯入編輯。未部署 GitHub Pages。

## 填充結構萃取與介面簡化（2026-11-15）

- 新增 Extraction 入口 `extractStructure` 及獨立幾何輔助 `extraction/structure-analysis.js`；Transfer、Preview、Export 核心及四份正式 v1 Schema 未改動。
- 原 PDF 的 869 段填充線皆可歸入封閉區域：6 個柱候選、3 個水泥牆區。辨識出位於「木作」圖層的茶水間 L 型與下方短隔間，保留六頂點凹輪廓，不以外框代替 L 型。
- 原有牆圖層中另有 4 組無填充平行牆線，依使用者慣例暫作淺木色輕隔間。左側水泥牆不再被重複列為輕隔間；桌椅、櫃體與窗框沒有因平行線而加入此分類。
- `check-structure-extraction.mjs` 通過：真實 PDF 13 個候選、來源不可變、來源追溯、毫米投影、跨圖層填充、L 型與短牆、柱分類、單一 X 不是填充、缺邊拒絕、重複線／路徑順序／裁切後 ID 穩定、孔洞保留、跨界構件不截斷成新物件。
- `check-model-pipeline.mjs`、`check-services.mjs`、`check-plan-analysis.mjs`、`validate_contracts.py` 通過；既有 PDF 5 面／DXF 7 面牆的 3D 初稿流程未回歸。12 個 JavaScript 模組通過語法檢查。
- 瀏覽器驗證原 PDF 的 C1–C6、W1–W3、L1–L4 輪廓與原圖對齊；標記開關正常，旋轉 PDF 後輪廓對齊且參考牆不變，旋轉一圈回到原角度。
- 「讓牆面站起來」設定區、參考牆／牆厚／牆高欄位，以及 2D／3D JSON 下載按鈕均已移除。DOM 驗證相關輸入／按鈕數量為 0；UI 固定顯示自動採左上牆厚 20 cm／牆高 250 cm。
- 「產生 3D 預覽」移到分頁旁。未轉換時 TAB 停用；成功後啟用，原有 5 面牆可顯示且無 JSON 下載按鈕；移除圖面會清空結構數量／標記並重新停用轉換及 3D TAB。
- 開發證據位於 `outputs/extraction/plan2d.structure.json`，未放入 `web/`；瀏覽器從上傳檔即時計算，沒有對使用者提供 JSON 下載。
- 新畫面截圖：`.local/extraction-review.jpg`。本次新增結構只在 2D 核對，尚未加入 3D 轉換；材質是使用者提供的圖面顯示慣例，全部候選保持未確認。
- 尚未支援：斜向／曲線結構外框、影像掃描、未命名填線圖層的紋理偵測、DXF HATCH、完整門窗／地板／家具語意。未執行 DAE／SketchUp 驗收或網站部署。

## 柱與隔間同步至 3D（2026-11-15）

- 修正 UI 仍呼叫舊 `buildWallPlan` 的問題，改由 `buildStructurePlan` 將目前萃取結果交給 Transfer。原 PDF 13 個候選逐一產生 13 個實體：6 柱、3 個水泥牆區、4 個淺木色輕隔間；包含 L 型及下方短隔間。
- 新增 FloorPlan2D v2 與 TransferReport v2 Schema；舊 v1 Schema／入口保持相容。`migrateFloorPlanV1ToV2` 通過升級前後 Scene3D 完全一致、來源不可變的驗證。Scene3D v1 與 Preview／Export 介面不變。
- `check-structure-transfer.mjs` 通過：凹角不填滿、精確輪廓面積×2500 mm 體積、封閉面、柱孔洞、樓層高度、毫米矩陣不重複套用、灰／木色材料、每個物件各自 group + mesh 與來源追溯；真實 PDF 27 節點／13 網格、DXF 15 節點／7 網格。
- 失敗案例通過：柱高度為零、未確認、材質缺失、重複 ID、自交或非法洞環、尚未支援的多邊形牆開口、萃取來源不一致及缺少校正資料。初稿仍保持 preview_only 並被正式 Export 阻擋。
- v1 `check-transfer.mjs`、`check-model-pipeline.mjs`、`check-services.mjs`、結構萃取測試及六份契約測試通過；13 個 JavaScript 模組通過語法檢查。
- 瀏覽器重新匯入原 PDF 後轉換：3D TAB 從停用變成啟用，畫面顯示「6 個柱、7 個牆區」；灰色柱／水泥牆、淺木色隔間及 L 型輪廓實際可見。柱與牆均沿用 250 cm 高度，左上牆厚 20 cm 校正維持不變。
- 2D／3D JSON 按鈕和已移除的尺寸設定欄位，DOM 數量仍為 0。PNG 下載成功，新檔名 `twothreeD-structure-preview.png`。
- 最新開發產物：`outputs/structure-preview/`；畫面截圖 `.local/structure-3d-preview.jpg`。門窗、地板、家具與 DAE／SketchUp 驗收仍未完成。
# 2026-11-15：門片與 OA 辦公區空心隔板

- 原始 PDF SHA-256：`4353aa12450c23763f1e22d691c473d8584133c9f2bd4acc7b8b08943a042ac3`。
- 使用者已澄清輕隔間是「新做 OA 辦公家具」旁的空心平行線，並確認高度沿用 250 cm。茶水間 L 形牆與短牆保持水泥灰。
- 實際萃取：6 柱、3 水泥牆、5 輕隔間、2 門。OA 空心隔板合併為一組 28 頂點凹輪廓，來源面積 1573.8192 平方 PDF 點；4 個桌面中心及座位區不填滿。兩個門軸來源座標為 `[801.44,724.68]`、`[808.76,692.52]`，門片高 2100 mm，保留原圖開啟方向。
- 最新 UI 管線為 FloorPlan2D v3 → Scene3D v1 + Report v3；16 個獨立實體、33 節點。開啟／關閉門片若碰到牆柱即拒絕；封門標示、無門片弧線及家具曲線不冒充門。門框與過樑未建模。
- 通過：`check-doors-office.mjs`、`check-structure-extraction.mjs`、`check-structure-transfer.mjs`、`check-transfer.mjs`、`check-contracts.mjs`／`validate_contracts.py`、`check-model-pipeline.mjs`、`check-services.mjs`、`check-plan-analysis.mjs`、`check-scene-preview.mjs`，以及 16 個 JS 模組語法檢查。
- v1/v2 Schema 保持不變；新 v3 有 migration 與 golden fixture。v2 → v3 空門陣列升級後 Scene3D 完全相同，八份 Schema 均通過。DXF 仍為 7 牆／7 網格，門扇辨識未支援會提示。
- 本機瀏覽器實測：重新讀入原 PDF、2D C/W/L/D 標記、OA 隔板輪廓、轉換後 3D TAB 啟用、灰色牆柱／淺木色隔板／深木色門片與數量皆顯示，PNG 下載成功；瀏覽器 console 無 error/warn。
- 畫面：`.local/doors-oa-2d.jpg`、`.local/doors-oa-3d.jpg`。測試產物更新至 `outputs/extraction/`、`outputs/structure-preview/`。原始 PDF 未放入網站，未部署、未進行 DAE／Windows SketchUp 驗收。

# 2026-11-15：椅子與帶 X 高櫃

- 使用者確認椅座 450 mm、椅背總高 850 mm、高櫃 2100 mm；大框中的 X 代表高櫃。寬深由現有左上 200 mm 參考牆比例換算。
- 實際 PDF：18 椅（會議區 14、OA 區 4）、12 櫃（左 4、右 8）；加上既有 6 柱、8 牆區、2 門，共 46 個來源物件／232 個零件 mesh／279 個節點。門、柱、OA 隔板及茶水間水泥牆保留。
- 椅子面向座面前邊線，會議區朝中央、OA 區朝桌面；高櫃按完整外框量測，正面朝主區中心只是顯示推定。小型鐵件 X 未當成大型高櫃。沒有把桌面或椅子周圍的空間填滿。
- 新增 `furniture-analysis.js`（萃取）、`furniture-templates.js`（通用幾何模板），五個 Service 邊界不變。FloorPlan2D／Report v4 與 migration／golden fixture 已建立，Scene3D v1 不變；v3 升級後舊 Scene3D 完全一致。
- 通過 `check-furniture.mjs`：原 PDF 證據、18 椅／12 櫃、朝向、外框與 X 規則、裁切／重複線／順序穩定、座高／總高／櫃高、旋轉及樓層高度、封閉零件、材質／mapping、未知模板與無效尺寸等失敗條件。
- 通過 `check-structure-extraction.mjs`、`check-structure-transfer.mjs`（實際原 PDF／DXF → v4 → Scene3D → Preview）、`check-doors-office.mjs`、`check-transfer.mjs`、`check-model-pipeline.mjs`、`check-services.mjs`、`check-plan-analysis.mjs`、`check-scene-preview.mjs`、10 份 Schema／fixtures 及 18 個 JS 模組語法檢查。
- 本機瀏覽器實測：選取原 PDF、2D CH／CB 標記、46 候選、3D TAB 轉換前停用／成功後啟用、18 椅與左右高櫃顯示、PNG 下載成功；console 無 error/warn。
- 截圖 `.local/furniture-2d-preview.jpg`、`.local/furniture-3d-preview.jpg`；更新 `outputs/extraction/`、`outputs/structure-preview/`，網站仍從上傳檔案即時計算，不讀測試產物。
- 模板為專案自產幾何，未下載外部模型。已查官方 SketchUp GLB／DAE 與 Three.js Loader 文件，以及 Kenney CC0 家具包；來源連結記於 README。正式模型匯出、Windows SketchUp 匯入／獨立編輯仍未驗收，SPEC 第 7 項保持未完成。


# 2026-11-15：桌子與 120 cm 辦公屏風

- 原始 PDF 實際辨識 4 組 L 形 OA 桌及 1 組中央留空的橢圓會議桌；桌高 900 mm。新增桌子後共 51 個來源物件、267 個網格、319 個節點。桌板厚 40 mm 與桌腳是顯示預設，並非圖面量測。
- `table-analysis.js` 將相鄰桌面合併、沿 Bézier 曲線建立外環／洞環；排除已識別結構／家具、X／填線、設備及櫃體標示。小量端點量化容差不允許補缺弧；裁切外框不會把內孔變成實心桌。
- 使用者新增辦公規則取代原 OA 250 cm：任何「辦公」標示所在家具面旁的無填充空心隔板，可推定為 1200 mm 屏風；沿相鄰細長面連接。填線與已識別水泥區優先排除；其他牆柱仍 2500 mm，茶水間水泥 L 牆／短牆保持原值。
- FloorPlan2D／Report v5 加入輪廓桌面及 tables 數量；舊 v1–v4 Schema 不改，v4 → v5 Scene3D 完全相同。表面／桌腳獨立 mesh，五個 Service 邊界維持分離，Preview／Export 介面及 Scene3D v1 不變。
- 通過 `check-tables.mjs`：4 L 桌＋橢圓孔洞、凹角不填滿、桌腳在輪廓內、900 mm 桌高、樓層偏移、封閉網格／材質／mapping、尺寸／孔洞／模板失敗案例、未標示空框、設備／填線排除、裁切／順序／重複穩定、v4 migration、辦公文字與填充優先、屏風 1200 mm／其他牆柱 2500 mm。
- 通過結構萃取／轉換、椅櫃、門片／辦公區、舊 Transfer、PDF/DXF model pipeline、Services、Plan Analysis、Scene Preview 回歸；12 份契約範例及 19 個應用程式 JS 模組語法檢查。
- 本機瀏覽器重讀原 PDF：51 候選與 T1–T5 標記；3D TAB 由停用轉啟用，4 組桌面、中央留空會議桌、降低的屏風均可見；頁面明示桌高 90 cm／屏風 120 cm。PNG 下載成功，console 無 error/warn。
- 截圖 `.local/tables-2d-preview.jpg`、`.local/tables-screens-3d-preview.jpg`；更新 `outputs/extraction/` 及 `outputs/structure-preview/`。網站仍從使用者檔案即時計算，沒有 JSON 下載按鈕。
- 尚未實作任意圖面的完整語意分類、掃描 PDF／DXF 家具語意、正式 DAE／GLB 輸出；未進行 Windows SketchUp 匯入編輯驗收或部署。SPEC 第 4／7 項維持未勾選。


# 2026-11-15：物件字典、具名櫃體與六面標名方塊

- 對應表 v0.2.0 已接入，53 類別涵蓋原 19 類及使用者核准的 34 種新增物件。場景僅用於整理；純規則比對文字／框線，不提供 AI、OCR 或完整房間推論。
- 使用原 PDF（SHA-256 同前）實際產生 69 候選物件／333 網格／403 節點；新增 6 個具名櫃體及 12 標名方塊。小檔案櫃 900 mm，其餘本次新增櫃體 1500 mm；原 12 個大框＋X 高櫃 2100 mm。
- 飲水機與烘碗機的方塊底部為茶水櫃頂 1500 + 浮高 100 = 1600 mm，頂部 2000 mm；3 台印表機亦有櫃體 support_id，跨櫃一台保留警告。地面物件底部 100 mm。方塊 400 mm 是使用者指定示意大小，並非設備真實尺寸。
- 電鍋 X2 依使用者後續要求加入忽略清單，不生成、不列待核對提示；雨傘架、海報機仍以框內原名生成未分類方塊。
- 通過 check-catalog：53 類與各別名、櫃高規則優先、具名物件不誤分類成空框桌、原圖來源／排列／重複／裁切穩定、來源不可變、同樓層承載／孔洞驗證、零尺寸／缺失材質／缺失承載／循環承載阻擋、六面文字貼圖／UV／朝外面向、獨立物件 mapping、樓層高、strict／Export 初稿阻擋。
- v6 golden fixture、v5→v6 Scene3D 完全相同；十四份 schema fixtures 經編譯 Ajv 通過，22 個應用程式 JavaScript 模組語法檢查通過。
- 舊 check-transfer、check-scene-preview、check-doors-office、check-furniture、check-tables、check-structure-transfer（PDF/DXF）、check-structure-extraction、check-model-pipeline、check-services、check-plan-analysis 全部通過。舊 API 不帶 catalog 保持 v5 行為；網頁傳入 catalog 使用 v6。
- 本機瀏覽器重新讀檔，2D 顯示 69 候選／18 櫃／12 標名方塊；3D TAB 由停用轉啟用，渲染與旋轉／縮放正常、無 console error。截圖 `.local/catalog-3d-preview.jpg`。電鍋忽略規則於此後以原 PDF 自動測試驗證；尚未重新載入使用者正操作的頁面。
- 新型別的真實居家／咖啡廳／飲料店／學校圖面、正式 DAE 匯出與 Windows SketchUp 選取／刪除／替換尚未驗收。未下載外部模型；SPEC 第 4／7 項保留未完成。

# 2026-11-15：免費模型來源、素材取得與引用服務

- 已由官方來源取得並保存 46 個 GLB，共 1,804,048 bytes、175 個 mesh 定義；Kenney Furniture Kit 與 3DAssets.dev 各 23 個。來源宣告皆為 CC0-1.0，逐檔記錄作者、來源、授權、引用與 SHA-256。3DAssets.dev 這批 23 個模型均標示 AI 協助製作，聲明已保留。
- 53 種類別皆有對照記錄：33 種類別符合、6 種通用造型、11 種款式待核對、3 種缺項；共 50 種有素材來源。烘碗機、飲料杯封口機、煮茶機保持 null；落地飲水機不視為本圖檯上設備的直接替代品。
- `fetch-model-assets.py` 完成檔案取得／雜湊驗證；`inspect-model-assets.mjs` 解碼全部模型的位置 accessor、節點世界變換、原生尺寸及三角形數，沒有外部 buffer／圖片 URI。分別記錄重複實例的渲染面數及唯一 mesh 面數，與來源 metadata 比對後一致。
- `check-model-assets.mjs` 通過：53 種物件 reference 與既有 active model 對照、46 檔 GLB 結構／雜湊／自包含資源／非零原生尺寸、CC0 引用、3 個明確缺項、查詢不可變、共享素材引用去重、錯誤路徑／授權／雜湊／參照及 fetch 失敗案例。
- 原 PDF 再跑 `check-catalog.mjs` 通過：仍為 69 個來源物件、333 網格、403 節點；字典辨識、承載、六面標名方塊、既有尺寸、來源群組與 strict／Export 阻擋維持原行為。Node PDF.js 僅出現既有建議使用 legacy build 的提示，無測試失敗。
- 新增素材服務及幾何檢視腳本通過 JavaScript 語法檢查，下載腳本通過 Python 語法檢查。SPEC 更新至 1.12.0；素材來源、授權與引用步驟已勾選。
- 本機 HTTP 驗證通過：`/config/model-assets.json` 可讀取 53 種對照及 46 筆素材記錄，表內本機 GLB URL 可取得正確檔頭；全部素材的來源網址與雜湊均出現在 CREDITS.md。
- 本次只新增素材引用，沒有改動 FloorPlan2D／Scene3D 契約或主圖渲染；所有外部素材的 `runtime_enabled = false`。尚未逐件做瀏覽器外觀／材質驗收、適配圖面尺寸與承載、接入 Scene3D、正式匯出或 Windows SketchUp 匯入編輯測試。

# 2026-11-15：依物件自身圖框計算尺寸並套用模型

- 使用者確認自身圖框＋既有 20 cm 參考比例；設備等比例容納於框，櫃體配合框寬深及 90／150／210 cm，沒有套用 0.9。FloorPlan2D／Report v7 新增 model_object／asset_models；v6 migration 幾何完全相同，Scene3D 保持 v1。
- 37 類／34 個純色素材可載入；34 個來源解碼後尺寸與原檢視記錄一致，116 個零面積三角形被移除並記錄。含貼圖的 3 個來源明確拒絕；款式差異、缺項與未分類者維持方塊。原始 GLB 未修改。
- 原 PDF 實際 Reader → Extraction → v7 → Transfer → Preview：69 個來源物件，24 個套用模型（18 櫃＋3 印表機＋冰箱＋碎紙機＋影印機），6 標名方塊，301 網格／371 節點。每個模型獨立 group、材質、來源 mapping 與授權引用保留。
- 三台印表機圖框約 74×54 cm，模型等比例後約 66.5×53.8×46.8 cm，底部均為櫃頂 150 cm，沒有方塊的 10 cm 浮高。冰箱約 79.3×53.8×169.6 cm，底部在地面。這些尺寸是圖框推估，不是產品規格。跨櫃印表機仍列 W_MODEL_SUPPORT_OVERHANG。
- `check-model-fitting.mjs` 通過：全部可載入素材、v7 golden fixture、v6 migration、等比容納與櫃體三軸尺寸、底部零點／樓層偏移／承載、輸入不可變、獨立 mapping、零尺寸／策略錯誤／無效承載／缺失幾何／雜湊與 fetch 失敗阻擋、原 PDF 全流程、渲染網格數及同材質繪製批次。
- `check-model-assets`、`check-catalog`（原 PDF v6 保留 69 物件／333 網格／403 節點）、`check-contracts`（16 份）、`check-transfer`、`check-scene-preview` 通過。Node PDF.js 仍只有建議 legacy build 的提示。
- 本機瀏覽器重新載入原 PDF，轉換前 3D TAB 停用，成功後顯示 24 物件套用模型／6 標名方塊；櫃體與設備可見，旋轉／縮放與 PNG 下載成功，console error/warn 為空。驗證圖 `.local/asset-model-preview.png`，最新測試輸出 `outputs/asset-preview/`。
- 未對整個素材庫逐件核對款式及正面方向；目前僅來源預設姿態、基礎純色和平面法線，不保存動畫、來源平滑法線或完整 PBR。外部模型仍為 preview，strict 阻擋；未進行 DAE／Windows SketchUp 匯入編輯驗收。
- 最後檢查：26 個應用程式 JS 模組語法通過；獨立已知尺寸 fixture 驗證 200×100×300 mm 模型縮放 3 倍、旋轉 90°、樓層高 700 mm 後，世界邊界精確為 `[4850,2700,700]` 至 `[5150,3300,1600]`。外框與宣告尺寸不一致會拒絕；上述模型、契約、核心與預覽測試再次通過。

## 2026-11-15：SketchUp 2025 DAE ZIP 初稿下載

- 使用者指定 SketchUp 2025，採 COLLADA 1.4.1 交換格式；本次修改 Export、其格式／PNG／ZIP 輔助及 UI 編排，未修改 Reader、Extraction、Transfer、Preview 或 FloorPlan2D／Scene3D 公開契約。
- `check-export.mjs` 通過：原圖 69 物件群組＋1 樓層群組、301 網格、14,289 三角形、42 材質、6 張 512×512 PNG；ZIP 2,792,485 bytes、9 個檔案，不含 PDF／JSON。JSZip 獨立解壓及 CRC 檢查通過，檔案內容逐一相同；固定時間輸出一致，輸入 Scene3D 未改動。
- 預設 validated 模式拒絕 preview，明示 draft 下載保留原始未確認狀態。無效 Schema、重複 ID、循環／缺失 parent、越界索引、退化面、缺失材質／標籤、無效 XML 字元、來源貼圖、未知格式與 ZIP 不安全路徑均有失敗案例；不產生部分成功檔案。
- `check-dae.py` 使用 Python 標準函式庫獨立讀回：實圖 371 節點／14,289 三角形與 fixture 9 節點／84 三角形；逐頂點毫米座標完全相同，沒有額外 transform，父子階層／來源 ID／原名、面積、朝向、UV／材質參照與圖片完整。已知尺寸 fixture 為 5000×150×2800 mm 牆、900 mm 門洞、窗洞及獨立地板；檢查輸出尺寸與洞內測試點沒有被面覆蓋。應用程式牆高預設仍為 2500 mm。
- 依 [Khronos Schema 驗證說明](https://wikis.khronos.org/collada/Schema_validation)，下載未修改的 [COLLADA 1.4.1 XSD](https://www.khronos.org/files/collada_schema_1_4_1.xsd) 與其 [W3C XML Schema 相依檔](https://www.w3.org/2001/03/xml.xsd) 至 `.local/collada/`。以本機 XML catalog 解析相依、`xmllint --nonet --schema` 驗證實圖、fixture 及瀏覽器下載的 DAE，均通過。驗證時修正 COLLADA `name` 必須為 NCName 的限制；原始名稱保留於額外 metadata。
- 產生標籤 PNG 後逐一查看六種中文標籤；修正 Node 字型回退造成「飲」缺字，加入 PingFang TC／Heiti TC／Microsoft JhengHei 等中文字型。`.local/dae-labels.png` 六張標籤均可讀；瀏覽器下載的「飲水機」PNG 亦確認正常。
- 本機瀏覽器重新讀入原 PDF、產生 3D，點擊「下載 SketchUp 編輯初稿」成功，畫面回報 69 物件群組。實際下載 `基隆女中秘書室-平面規劃圖(5)1105-editable-draft.zip`，獨立解壓後確認 9 檔、371 節點、CRC 正確及 XSD 通過，console error/warn 為空。
- `check-services`、`check-contracts`（16 份契約）、`check-catalog`（v6 回歸）通過；30 個應用程式／匯出測試 JS 模組語法通過。PDF.js 在 Node 仍僅有既有 legacy build 提示。
- 交付位於 `outputs/sketchup/twothreeD-editable-draft.zip`；附匯入說明與實際採用模型的來源引用。SPEC 更新為 1.14.0，第 7.1 項已勾選；本機未安裝 SketchUp，**尚未執行 Windows SketchUp 2025 匯入、群組選取／編輯／替換、另存 SKP 及重開**，第 7.2 項維持待驗收。XSD 與讀回測試不能替代此實機結果。

## 2026-11-15：原創設備模型與飲水機承載選款

- 使用者確認三個缺項＋檯上飲水機，並指定有桌面承載選檯上款，無承載選落地款。新增四款自包含 GLB：烘碗機 148,264 bytes／58 零件／2,448 三角形；封口機 70,236 bytes／24 零件／1,152 三角形；煮茶機 89,624 bytes／37 零件／1,200 三角形；檯上飲水機 73,220 bytes／34 零件／912 三角形。
- `scripts/generate-model-assets.mjs` 是可重現的原創幾何來源；四款合計 381,344 bytes，保留零件名稱、純色與烘碗機透明門，無外部貼圖。沒有修改原有 46 個下載 GLB。生成後再次重建，檔案 SHA-256 完全相同；本機來源、CC0、程式助理協作及非產品規格皆明示，沒有虛構外部下載 URL。
- 素材表現在 50 個 GLB、53 類皆有參考、41 類／39 個素材可啟用。飲水機預設仍是 `3dassets.26218` 落地款，`placement_variants.on_support` 指向 `twothreeD.generated.water_dispenser_countertop`；選擇依據是萃取出的 `support_id`，未更動 Reader／承載辨識算法或 FloorPlan2D／Scene3D 契約。
- `check-generated-models.mjs` 通過：四款外形尺寸、焊接同位置頂點後每邊有兩個反向面、各零件正體積、無退化三角形、單獨 DAE 物件群組；桌子／櫃體／無承載的選款及底部高度、錯誤承載拒絕、三個原缺項的 v7 → Transfer 轉換。驗證個別零件閉合，不聲稱重疊零件已做布林聯集或是精確設備 CAD。
- 原圖重新 Reader → Extraction → Transfer 後為 69 物件、26 套用模型／4 方塊、391 網格／461 節點；烘碗機與飲水機均採新模型，底部在茶水櫃頂 1500 mm，沒有 100 mm 浮高。兩者約 617×504×597 mm、430×453×686 mm，使用原圖框比例。原圖沒有封口機與煮茶機，不會額外放入。
- `check-model-assets`、`check-model-fitting`、`check-contracts`（16 份）、`check-catalog`（v6 回歸）通過。新整圖 `check-export`／`check-dae.py` 通過：69 物件群組、17,625 三角形、51 材質、4 PNG，ZIP 3,335,262 bytes／7 檔；獨立逐頂點、面積、法線、階層、引用、CRC 驗證仍相同。四款單獨 DAE、新整圖 DAE 及瀏覽器下載皆通過官方 COLLADA 1.4.1 XSD。
- 本機 `/model-library.html` 四款原創模型逐一目視：透明門與碗盤架、杯用膜捲與杯架、濾茶槽與出茶嘴、雙出水口及接水盤可辨識；第五款提供落地飲水機對照。檯上飲水機單獨 DAE ZIP 下載成功，console 無 error/warn。展示頁圖 `.local/generated-models-gallery.jpg`。
- 工作室重新載入原 PDF，成功顯示 26 模型／4 方塊，下載整圖成功，console 無 error/warn。實際下載的 ZIP 3,351,456 bytes（瀏覽器字型 PNG 與 Node 有差異），7 檔、461 節點、CRC 正確、XSD 通過。畫面 `.local/generated-models-plan.jpg`，下載解壓內容 `.local/generated-browser-export/`。
- 32 個 JS 模組／腳本語法與下載腳本 Python 語法檢查通過。原創模型下載包 `outputs/generated-models/twothreeD-original-appliances.zip` 約 1.36 MB／11 檔，含四個 GLB、四個 DAE、生成程式、來源與使用說明，Python ZIP CRC 檢查通過。SPEC 1.15.0 §0.20 已勾選完成；SketchUp 實機匯入／編輯、未辨識承載或其他圖面仍未宣稱驗收。

## 2026-11-16：一般／電子白板支架模型

- 使用者最後確認兩款皆依完整圖示尺寸與支架。新增 `whiteboard.glb` 58,956 bytes／24 零件／792 三角形、`electronic_whiteboard.glb` 67,280 bytes／27 零件／912 三角形；原創 CC0，腳輪、支架、板框與筆槽可見，電子白板另有控制面板。
- Extraction 分開匹配名稱、合併薄板與支架外框，保留唯一完整 W/D/H 尺寸文字來源；數字缺單位、缺欄位、位置不符或兩個候選不猜測。原 PDF 讀出一般白板 1400×650×1930 mm、電子白板 1300×850×1760 mm，兩者無承載且底部落地。
- FloorPlan2D／Report v8 新增 `equipment_dimensions`，v7→v8 無模型及有模型的既有幾何不變；Scene3D v1 不變。check-boards 覆蓋單位／全形、歧義、支架範圍、原檔不可變、精確幾何、缺失尺寸退回方塊、無效高度／承載與實際 PDF 來源追溯。
- 18 份契約、check-model-assets（54 類／52 GLB）、check-generated-models（6 原創）、check-model-fitting（原 PDF 28 模型／2 方塊／440 網格／510 節點）、check-catalog（舊 v6 69 物件／333 網格／403 節點）通過。
- check-export 與 Python check-dae 獨立讀回通過：69 物件群組、19,305 三角形、60 材質、2 PNG；5 檔 ZIP 3,624,402 bytes。新整圖與兩款單獨 DAE 通過官方 COLLADA 1.4.1 XSD。PNG 為剩餘海報機、雨傘架方塊的六面文字；幾何仍在 DAE。
- 模型庫兩款支架外觀已目視，截圖 `.local/boards-gallery.jpg`。Windows SketchUp／Blender 實際匯入與編輯尚未執行；格式／幾何測試不能取代該驗收。

## 2026-11-16：紅色方塊與單一 DAE 下載

- 使用者改為無字紅色方塊；v8 `builtin.marker_cube.v1` 保留 400 mm 邊長、100 mm 浮高、支撐、原名群組與來源 mapping。`label_mode: none` 不含 `face_labels`，純色 RGBA 為 [0.85, 0.16, 0.12, 1]。舊 v6／v7 標籤幾何不改。
- `export3D` 新增 `container: dae`，獨立檔案型別為 model/vnd.collada+xml，source metadata 保留作者／來源／CC0／SHA-256。若仍需 PNG，拒絕單檔匯出並要求 ZIP，沒有悄悄遺失資源。舊 ZIP API 仍可使用；網頁與模型庫下載採 DAE。
- check-boards 的 v8 fixture 含兩種支架白板及紅色方塊：尺寸／浮高／紅色、無 Canvas 文字生成、純色材質批次、混入標籤拒絕、來源不變、v7 migration 通過。18 份契約、check-catalog、check-scene-preview、check-generated-models、原 PDF check-model-fitting 通過。
- check-export 通過：69 物件群組／440 網格／510 節點／19,305 三角形／58 材質／0 外部圖片；單 DAE 3,589,218 bytes。確認所有來源雜湊仍在 XML、不含 image/TEXCOORD，舊六面文字方塊仍可完整 ZIP 匯出，缺少標籤與錯誤階層／幾何／材質拒絕。Python 獨立讀回與官方 XSD 通過。35 個 JavaScript 模組／腳本語法通過。
- 瀏覽器重新讀原 PDF，3D TAB 先停用，轉換後啟用，顯示 28 模型／2 紅色方塊。白板／電子白板支架模型可見；下載按鈕為「下載 DAE 編輯初稿」，實際取得 `基隆女中秘書室-平面規劃圖(5)1105-editable-draft.dae`，3,589,226 bytes／510 節點，無圖片或 UV 資源，通過官方 XSD。console 無 error/warn。截圖 `.local/red-markers-dae-preview.jpg`。
- SPEC 1.17.0 §0.21／0.22 已記錄完成。實際 SketchUp／Blender 匯入和 SketchUp 編輯、刪除、另存 SKP 重開仍待使用者驗收；本次未宣稱實機測試通過。

## 2026-11-16：六款原創模型配色

- 使用者確認同款共用、只改外殼；白板改板框並保留白色書寫面與金屬支架。新增 model-appearance.json、獨立 Model Appearance Service、共用 model-color-controls.js 與 CSS。原始 GLB／SHA-256 不變；Scene3D 既有材質欄位承載顏色，無需修改 schema。
- check-model-colors 通過：六款指定零件存在／原色對照正確；HEX 正規化、無效輸入、sRGB 線性數值、儲存失敗、不可信保存值過濾、來源不可變、非主殼零件不變、重設、同款多物件共用材質、紅色占位方塊不變，Preview 與 DAE 的顏色及幾何一致。6 款與整圖配色 DAE 存於 outputs/color-preview/，整圖通過官方 XSD。18 份契約與 check-scene-preview 回歸通過。
- 瀏覽器模型庫輸入無效 #GGGGGG，正確提示且原色未改；#0077CC 成功改烘碗機外殼，玻璃／碗盤／金屬架／控制鈕保留。實際下載「檯上烘碗機-editable-draft.dae」，59 節點，配色 metadata 與原玻璃 alpha 0.22 讀回正確，XSD 通過。
- 獨立測試頁讀原 PDF、轉成 3D 後，主圖配色欄載入儲存的 #0077CC。一般白板板框設定 #E67E22，模型庫即時同步；整圖 DAE 實際下載 3,590,704 bytes，510 節點、0 外部圖片，包含兩個色碼，通過 XSD。
- 模型庫與主圖的恢復原色操作及反向同步成功，測試顏色全部還原；兩頁 console 無 error/warn。截圖 `.local/model-colors-preview.jpg` 是藍色外殼示範。保留使用者原預覽分頁，主圖測試在獨立分頁完成。
- SPEC 1.18.0 §0.23 已勾選。尚未在 SketchUp 實機核對色彩／匯入編輯；不同軟體光照與色彩管理不保證像素一致。

## 2026-11-16：GitHub Pages 部署與線上驗證

- 本機 main 與 origin/main 起點均為 fa08c22，既有儲存庫為 WU-YU-HUA/TwoThreeD（public）。新增官方 Actions 工作流程，發布範圍僅 web/。
- check-static-site 通過：52 個 GLB 雜湊、HTML／模組在 /TwoThreeD/ 下的參照、PDF.js worker／字型／WASM，部署目錄無 PDF、DAE 或 ZIP 等開發產物。
- 現有 Git 憑證可推送一般內容，但缺少 workflow scope，Pages API 回覆 403；使用者指定已登入的 Chrome，透過 GitHub 網頁將 Source 設為 GitHub Actions 並提交部署流程，未修改憑證權限。一般內容提交 4a4be65、部署流程提交 cd81fb3，本機已同步遠端。
- [首次 Actions #1](https://github.com/WU-YU-HUA/TwoThreeD/actions/runs/43792782815) 成功（22 秒），只發布 web/；正式入口 <https://wu-yu-hua.github.io/TwoThreeD/>。官方 Actions 有 Node 20→24 遷移提示，但全部步驟成功。
- Chrome 線上 DXF 範例成功辨識 7 面牆、啟用 3D TAB、顯示 Three.js 模型及下載 DAE。實際下載檔 23,184 bytes，獨立 XML 讀回 15 節點／7 網格／0 圖片。
- Chrome 線上模型庫載入六款原創模型與落地飲水機，顯示各模型零件數、下載入口及配色控制；主頁與模型庫 console 無 error／warn。
- Chrome 自動選檔因擴充套件未開放 file URL 存取而無法注入檔案；未修改瀏覽器權限，改用獨立測試瀏覽器驗證同一 HTTPS 網站。原 PDF 成功萃取 69 物件，轉成 6 柱／8 牆區／2 門／18 椅／18 櫃／5 桌／28 套用模型／2 紅色方塊，未觀察到 console error／warn 或資源 404。
- 線上原 PDF 的單一 DAE 實際下載 3,589,226 bytes，獨立 XML 讀回 510 節點／440 網格／0 外部圖片，通過官方 COLLADA 1.4.1 XSD。截圖 `.local/github-pages-preview.jpg`。本次部署未變更解析、轉換、預覽、輸出服務與資料契約；SketchUp 實機匯入／編輯仍待原驗收項目完成。

## 2026-11-17：新增扶手辦公椅

- `office-chair-analysis.js` 新增成對閉合扶手＋曲線椅背＋單一前緣規則；舊椅子判斷優先，未知線群仍略過。`office-chair-template.js` 保存獨立參數模型，24 個閉合零件，包含雙扶手、五腳底座與腳輪。既有 chair 契約、服務邊界與四腳椅模板不變。
- `check-office-chairs` 通過符號旋轉 30／90／180／270 度、順序／重複穩定、缺扶手／未閉合／錯位／附加連線／過小／裁切排除；模型寬深、旋轉、樓層偏移、座面 450／總高 850／扶手 650 mm、五個腳輪、24 個封閉網格與 25 個來源對應節點通過。Three.js 與 DAE 使用相同幾何。
- 新 PDF `(2)0615` 全流程辨識 14 張原椅＋3 張扶手辦公椅，三張新椅皆朝左側辦公桌，17 張皆轉成 Scene3D 與 DAE。舊 `check-furniture`、`check-tables`、`check-contracts`（18 份契約）、`check-scene-preview` 及靜態網站依賴檢查通過。
- 以 HEAD 修改前實作對照，新 PDF 原有家具、舊 PDF 已保存的全部家具辨識結果，以及 v4／v5／v6 既有家具模板幾何逐項比對相同；舊圖 18 椅、12 個 X 高櫃、4 組 L 桌＋1 組帶孔會議桌維持原結果。
- 瀏覽器載入新 PDF 並轉換，3D 狀態列顯示 17 椅；另以獨立場景檢視雙扶手、座背與底座／腳輪，console 無 error，截圖 `.local/office-chair/preview.jpg`。單椅與全圖 DAE 通過官方 COLLADA 1.4.1 XSD。SketchUp 實機匯入、編輯仍待驗收。
- 桌子規則依使用者要求未修改：中央閉合會議桌仍因接觸的椅子線段觸發 outwardConnection 而排除；新圖仍為 9 個桌面候選，其中六個微小圓形為既有誤判。SPEC §0.25 記錄討論方案，不把討論當成已完成。此輪修改僅在本機，未推送／發布 GitHub Pages。
