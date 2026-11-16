# FloorPlan → Editable SketchUp：技術規格（SPEC）

- **文件狀態**：Draft / 可作為 MVP 開發基線
- **版本**：1.19.0（文件；FloorPlan2D／Report 支援 v1–v8；Scene3D 維持 v1）
- **目標環境**：桌面瀏覽器、純靜態 HTML/CSS/JavaScript；先提供本機開啟，後續可部署 GitHub Pages。2D 檔案在瀏覽器處理，生成可下載的 DAE，使用者自行匯入 Windows SketchUp 編輯。無本機轉檔工具依賴；Python 僅用於開發時提供靜態網頁。
- **最重要的原則**：**Input Adapter、2D IR、Transfer Engine、3D IR、Exporter 彼此隔離；替換任何一層，其他層的公開契約都不變。**

## 0. 開發項目與完成狀態

依使用者指定順序執行；只有完成且確認實際結果的項目才勾選。最後更新：2026-11-16。

- [x] **1. 畫面**：本機可開啟圖面工作台，包含選檔入口、預覽區與圖面資訊。
- [x] **2. 讀檔**：選擇或拖放 PDF / ASCII DXF，顯示原始圖面；支援 PDF 換頁、旋轉及圖面縮放、平移。
- [x] **3. 確認讀檔內容（測試用）**：預設聚焦主要平面圖，排除圖框／標題欄；依選區內圖層與物件標示整理空間、牆與開口、家具收納、設備，並以實際檔案驗證。提供完整原圖切換與 PDF 手動框選。
- [ ] **4. 輸出 2D 資訊**：辨識並人工校正牆／門窗／地板，通過比例、Schema 與語意驗證，產生供服務使用的 FloorPlan2D；不提供使用者 JSON 下載按鈕。
- [x] **5. 轉換 3D 資訊（核心）**：已實作 `FloorPlan2D` → `Scene3D` + `TransferReport`，支援直線牆、矩形門窗空洞、含洞地板、樓層高度與來源追溯，通過 Schema 及幾何測試。網頁已接入柱與多邊形隔間候選；完整建築物件辨識仍屬第 4 項。
- [x] **6. 預覽 3D 畫面**：Preview Service 已顯示本次 PDF／DXF 柱與隔間轉換結果，向量 PDF 已加入門片及 OA 區輕隔間，提供旋轉、縮放與 PNG；JSON 僅供內部處理與測試；TAB 預設停用，轉換與顯示成功後才啟用，改檔／改頁／改選區會使舊結果失效。
- [ ] **7. 輸出 3D 檔案與 SketchUp 驗收**：下載功能已完成，實機編輯驗收待完成。
  - [x] **7.1 下載檔案**：瀏覽器產生單一 COLLADA 1.4.1 DAE；缺少模型顯示無字紅色方塊，來源與授權保留在 metadata；保留獨立物件、材質與毫米座標。實際原圖及已知尺寸 fixture 通過格式與幾何讀回驗證。
  - [ ] **7.2 SketchUp 2025 桌面版實機驗收**：匯入、核對尺寸、獨立編輯／刪除／替換物件、修改面與材質、另存 SKP 及重開。

驗證紀錄：`tests/VERIFICATION.md`。本機入口：`啟動圖面工作室.command`。

### 0.1 第一階段範圍

- 第一階段只做第 1–3 項。PDF 包含向量與掃描 PDF，皆可先預覽；掃描文字的 OCR 不在本階段。
- 原始預覽不是 `InputAdapter` 的正式輸出，不得把原始 PDF/DXF 資料冒充 `FloorPlan2D`。前 3 項不需要生成 2D／3D IR。
- `web/` 為可獨立部署的靜態網站；`scripts/serve.py` 只在本機提供此目錄。檔案在瀏覽器記憶體處理，無上傳 API。
- 第一版上限為單一檔案 50 MB；DXF 非完整 CAD renderer，不支援的圖元必須顯示診斷。
- PDF 紙張尺寸不等於建築實際尺寸；DXF 宣告單位亦須在第 4 項人工確認。
- 首選匯出路徑為 DAE 下載 → 使用者自行匯入 SketchUp。Ruby / C SDK 僅保留為未來可替換 Exporter 的架構說明，不是目前交付要求；DWG 本機轉檔不在目前產品路線。
- 已建立四份 `schemas/`、`examples/` 與契約驗證程式；正式 IR 首次落地為 v1.0.0，原有診斷 JSON v0.1.0 維持不變。

### 0.2 主要圖面與物件檢視（已完成）

- PDF 優先讀取 Optional Content Groups，排除明確命名的圖框圖層，以建築／家具相關圖層的向量範圍定位主要圖面；不將本次 PDF 的座標硬編碼。
- 沒有可用圖層時，以保守的留白分隔方法提出選區；無法確定則顯示原圖並要求手動框選，不宣稱辨識成功。
- 每頁保留各自的自動與人工選區；旋轉與縮放不改變原 PDF 座標。使用者可切換完整原圖或重新框選。
- 物件面板只顯示主要選區內的相關圖層與匹配的空間／家具／設備標示。排除公司資訊、圖號、日期與純尺寸文字。
- 圖層名稱代表物件類別存在；「N 處標示」不代表已分割出 N 個實體。未標示的椅子等仍待幾何或影像辨識。
- DXF 排除明確命名的圖框圖層，以剩餘幾何範圍預覽；複雜／無法辨識圖框的 DXF 尚不保證能自動區分多個圖面。
- 此階段屬第 3 項的預覽與確認輔助，**不代表第 4 項 FloorPlan2D 已完成**。

### 0.3 家具 3D 模板方向（簡化椅子／高櫃已於 §0.12 實作）

- 牆／地板依確認後的尺寸生成；門窗須切出真實空洞。
- 家具採類型映射至可替換 3D 模板，保留位置、方向、尺寸、素材 ID 與來源授權資訊；缺少高度或款式時需要使用者確認預設值。
- 候選來源：Kenney Furniture Kit（CC0）、Poly Haven 模型（CC0）。初版可先準備少量基本椅子、桌子與櫃子；沒有匹配模板時用簡化外形並明示。
- 家具素材與牆體共同經 Scene3D / DAE exporter 匯出，每個家具保持獨立節點；素材的單位、座標、貼圖與網格複雜度需統一處理。
- 已下載 46 個外部 GLB 並整理來源引用，見 §0.17；主圖已於 §0.18 混合使用可用外部模型與內建模板。椅子／高櫃、v4 家具契約及預覽見 §0.12。§0.19 已提供 DAE 初稿下載，SketchUp 匯入編輯驗收仍待完成。

### 0.4 比例校正與牆高設定

- 使用者指定預設牆高為 **250 cm = 2500 mm**。這是建模預設值，來源為 `user_default`，不是 PDF 量測結果；每面牆日後仍可人工覆寫。
- 使用者指定**每次預設以左上牆面，厚 20 cm = 200 mm** 作為比例參考。以來源 XY 中最高一排候選牆的最左側為預設，手動旋轉顯示不改變選取；UI 不提供選牆／尺寸欄位，未來需調整時再擴充。找不到可配對的牆則阻擋建模，不把線寬或柱寬當牆厚。
- 使用者指定門高 **210 cm = 2100 mm**、窗台高 **90 cm = 900 mm**、窗高 **120 cm = 1200 mm**。集中於 `web/js/contracts/model-defaults.js`，已寫入 2D 初稿的 defaults；尚未辨識開口位置，因此不憑空補出門窗。
- 比例：`model_mm_per_pdf_pt = 200 / reference_wall_gap_pdf_pt`。
- 其他牆厚：`wall_thickness_mm = wall_gap_pdf_pt / reference_wall_gap_pdf_pt * 200`。
- 前提為同一張圖、同一比例且沒有非等比拉伸。線條配對仍須辨識牆角、門洞、櫃體與柱子，不保證每組平行線都是牆。
- 既有 3D 預覽用候選牆由牆圖層的平行邊線配對，厚度採垂直間距；以參考牆間距套用上述比例。現有 PDF 配對出 5 面候選牆；不同候選間距會產生不同牆厚。
- 預覽初稿會保留暫定的 `source_to_model_3x3`；使用者已提供尺寸預設，但邊線配對仍需核對，因此 `scale_verified = false`、物件 `confirmed = false`，不得當成已確認模型正式匯出。依使用者要求，§0.19 明示提供可編輯初稿下載，不更改確認狀態。未知／不存在比例矩陣時，即使預覽模式也失敗。

### 0.5 JSON 檢視輸出（已完成；正式 IR 尚未完成）

- [x] `outputs/json-preview/plan2d.inspection.json`：實際主要選區、圖層、29 處物件標示及座標；單位為 PDF 頁面點數，明確命名為 `Plan2DInspection@0.1.0`，不是正式毫米制 `FloorPlan2D`。
- [x] `outputs/json-preview/plan2d.geometry.json`：1371 組相關向量路徑及繪圖指令，包含作為牆體證據的 HATCH，排除圖框和尺寸圖層；尚未配對為獨立建築物件。
- [x] `outputs/json-preview/scene3d.proposal.json`：8 類物件的預計生成方式，以及一組獨立示意的 Scene3D 格式（牆、門洞、地板、簡化椅子）。`actual_scene3d = null`，不代表已從原 PDF 建模。
- 3D 示意採使用者指定的 2500 mm 牆高；其餘尺寸／位置是格式範例，明示 `derived_from_uploaded_pdf = false`。
- 此輸出是第 4 項的前置資料檢視；完整第 4／7 項仍未完成；第 5／6 項另由 §0.8 的實際轉換流程驗證，不把此規劃示例當成模型。
- 重現工具為 `scripts/export-json-preview.mjs`，屬本機開發／檢查用工具，不是正式轉換器，也不是網站的 Python 或 Node 後端。

### 0.6 獨立 Service（已拆分）

依使用者要求，每項責任一支 service，統一放在 `web/js/services/`：

| Service 檔案 | 入口與責任 | 目前狀態 |
|---|---|---|
| `file-reader-service.js` | `readFile(file)`：副檔名分流、驗證、PDF/DXF 解析、來源雜湊及資源釋放 | 已接入網頁與 CLI |
| `extraction-service.js` | `extractData(source)`、`extractInspection(source, extracted)`：主圖範圍、圖層／文字／向量證據 | 預覽與 PDF 檢視 JSON 已接入；正式 FloorPlan2D 待完成 |
| `transfer-service.js` | `convert2DTo3D(plan, profile)`：FloorPlan2D → Scene3D + Report；另提供 `create3DProposal(plan)` 檢視規劃 | 已實作幾何核心、Schema／語意驗證及 strict／preview 模式 |
| `export-service.js` | `export3D(scene, options)`：Scene3D → DAE ZIP；`createExportLabelTextures` 產生標籤 PNG；另提供開發用 `createJsonArtifact` | 已實作 DAE、資產打包及明示初稿下載；預設 validated 模式維持初稿阻擋 |
| `preview-service.js` | `createScenePreview(container)` → `show(scene)`：Scene3D → 可互動 3D 畫面 | 獨立 Three.js 顯示 service，已接入本次圖面產生的模型 |

- [x] 網頁的檔案驗證與 PDF/DXF 解析移入 Reader，主要範圍與物件清單移入 Extraction。
- [x] 原本混在 JSON 腳本的萃取、3D 規劃／格式示例與序列化拆開；CLI 只編排呼叫及寫入檔案。
- [x] Transfer 已實作真實幾何；無效輸入回傳失敗報告。DAE 已於 §0.19 完成；初稿僅可由明示的 draft 匯出模式下載，不能假冒已確認模型。
- [x] 3D 顯示獨立成第五個 service，與 Transfer / Export 分離。
- `plan-analysis.js` 與 `dxf-preview.js` 是 Extraction 的格式輔助實作；新增輸入格式在 Reader 加 reader，再於 Extraction 加對應資料萃取。
- 新增輸出副檔名只延伸 Export；Transfer 不接收輸出格式，也不依賴 Three.js、PDF/DXF、DOM 或檔案系統。
- Preview 只消費 Scene3D，不讀原始 PDF/DXF、不執行 2D → 3D 建模、不修改模型 JSON。Three.js 物件不回流至 Scene3D 契約。
- `readFile` 回傳的來源文件屬內部解析資料；用畢須 `await source.dispose()`。PDF 向量證據需在首次 render 前啟用 `includeGeometry: true`。
- `app.js` 編排操作與顯示狀態；檔案產物由呼叫端下載／儲存，Service 不直接寫使用者硬碟。
- 五個 Service 保持分離。完整語意辨識、人工修正／確認流程及 SketchUp 實機編輯驗收仍待完成。

### 0.7 3D 預覽（已接入本次轉換）

- [x] 「3D 預覽」TAB 初始為 disabled／反灰；不再自動載入固定示例。
- [x] 匯入 → 牆線配對 → 自動套用左上牆厚 20 cm／牆高 250 cm → 轉換 → Preview 驗證可顯示後啟用 TAB 並切換。
- [x] 轉換失敗、沒有牆線或 WebGL 失敗時，TAB 維持停用並顯示原因。
- [x] 換檔、移除檔案、換頁、改選區時，清除舊場景並重新停用 TAB。非同步載入以 revision／source token 排除舊結果。
- [x] 2D 原圖疊加牆柱輪廓與編號；橘色為自動選取的參考牆。§0.9 補上填充結構萃取；3D 已由 §0.10 顯示同一批柱與牆區。
- [x] 3D 顯示目前圖名、頁碼、牆數與尺寸；待辨識圖層和未配對線段列於「待核對項目」。沒有辨識的地板、門窗、家具不補上示例模型。
- [x] 旋轉、平移、縮放、重設視角、PNG 下載。已依使用者要求移除 2D／3D JSON 下載按鈕；JSON 仍作為內部服務資料。
- Preview 只消費通用毫米制、Z 向上 Scene3D；Three.js 不參與 Transfer，世界座標不再次套用父層位置。
- `web/assets/scene3d.example.json` 僅保留作回歸 fixture；網頁不再載入它。

### 0.8 真正的 Transfer 核心與初稿範圍

- [x] 四個 JSON Schema 及 sample contracts；以 Ajv 8.17.1 預先編譯成離線 ES module，瀏覽器不需要 Node 或網路驗證服務。
- [x] `convert2DTo3D` 支援任意方向的直線牆、分段實體、矩形門窗真實空洞、地板外環／洞環、樓層高度、材質及 source→node mapping。
- [x] 語意檢查：ID 唯一、比例矩陣、確認狀態、牆零長度、開口牆參照／越界／重疊、材質、無自交且方向正確的輪廓、洞環包含關係。
- [x] 網格檢查：有限頂點、合法索引、非退化面、封閉邊與正體積；測試門窗內無實體，地板孔洞保留、尺寸與體積正確。
- [x] strict 預設模式拒絕比例不明、未確認及未解決物件。preview 模式只允許顯示待核對初稿，仍拒絕格式、幾何、未知比例矩陣等錯誤。
- [x] preview 產物帶 `Scene3D.extensions.twothreeD.preview_only = true` 及 `TransferReport.preview_only = true`；Exporter 明確以 `E_PREVIEW_ONLY` 阻擋正式模型輸出。
- 目前網頁自動流程會建立柱與隔間候選的 FloorPlan2D v2，不承諾完整自動辨識。門窗、地板與家具尚未自動配對；柱體與輪廓牆已於 §0.10 接入 3D；對應圖層不會默默消失，會列為待核對。
- `outputs/model-preview/` 包含本次 PDF 牆體的 2D／3D／Report JSON（初稿，不可正式匯出）；實際 UI 每次從當前上傳檔重新計算，不讀取這些開發輸出。
- 牆角使用 butt，保留獨立牆體；接縫與重疊面以警告呈現，miter 尚不支援。貼圖、曲線牆與完整家具建模仍未實作。

### 0.9 填充結構萃取與簡化介面（已完成本階段）

本節記錄 Extraction 階段；後續 §0.10 將其結果接入正式 v2 輸入契約及 3D 預覽。

- [x] `extractStructure` 為對外入口；`web/js/extraction/structure-analysis.js` 是 Extraction 的純幾何輔助，負責封閉輪廓、交點與 T 接點、重複填線及分類。
- [x] 套用使用者圖面慣例：有斜線／網格填充的結構視為水泥候選；網格緊湊輪廓標為柱，細長／轉折輪廓標為牆。未填充的牆圖層平行線先作輕隔間，以淺木色板材表示；家具、窗框不因平行就直接歸類為隔間。
- [x] 實際 PDF 找出 **6 個柱候選、3 個水泥牆區、4 個輕隔間候選**。水泥牆含左側長牆、茶水間 L 型隔間與下方短隔間；L 型保留凹輪廓，不用外框填滿。
- [x] 保留來源路徑、圖層、填充紋理、材質判讀依據、未確認狀態，以及來源／毫米輪廓。`Plan2DStructureEvidence@0.1.0` 為檢視證據，並非正式 FloorPlan2D；開發產物在 `outputs/extraction/plan2d.structure.json`。
- [x] 2D 顯示 C/W/L 編號、輪廓、顏色圖例、數量與明細，可關閉標記對照原圖。交叉線分割的同類填充牆區合併，柱與相連牆分開；孔洞保留，跨選區構件不截斷成新物件。
- [x] 移除「讓牆面站起來」設定區與參考牆／厚度／高度欄位；固定自動採左上牆厚 20 cm、牆高 250 cm。找不到參考牆時保留來源輪廓並提示，不能用柱寬替代。
- [x] 移除面向使用者的 2D／3D JSON 下載按鈕；「產生 3D 預覽」移到分頁旁。新增結構已由 §0.10 同步至 3D；原有 5 面牆流程保留作 v1 回歸測試。
- [x] `check-structure-extraction.mjs` 驗證真實 PDF、L 型／短牆／柱、家具 X 排除、缺邊拒絕、重複線去重、裁切及 ID 穩定、孔洞與來源追溯。
- 邊界：此版依 PDF 的 HATCH／填充圖層線條及水平／垂直封閉邊界處理；斜向或曲線外框、影像掃描、無填線圖層的紋理辨識、DXF HATCH 仍待補。材質是使用者提供的顯示慣例，不是已驗證的工程材料。
- 整體第 4 項仍未完成：門窗、地板、家具語意與人工修正／確認仍待處理。新增柱與隔間的 3D 接線已於 §0.10 完成。

### 0.10 柱與輪廓牆接入 3D（已完成）

- [x] `buildStructurePlan` 將目前 `extractStructure` 的毫米輪廓轉為 `FloorPlan2D@2.0.0`；來源雜湊須一致，缺少左上牆比例即失敗。不再使用舊 `buildWallPlan` 作為 UI 入口。
- [x] v2 的 level 新增 `columns`，牆可用 `representation: "footprint"` 保存完整外環／洞環。Transfer 沿 Z 外擠，柱與牆各自保留 group、mesh、原始 ID 與 mapping。
- [x] 此 PDF 產生 **6 柱 + 7 個牆區 = 13 個網格**（3 個水泥牆區、4 個輕隔間）；L 型凹角保持空白，沒有用外接矩形填滿；不再疊加舊 5 面牆導致重複。
- [x] 柱高暫沿用使用者牆高預設 250 cm，牆高亦 250 cm。水泥灰與淺木色材質由 Extraction 寫入 IR，再由 Transfer 保留至 Scene3D。
- [x] `TransferReport@2.0.0` 新增 `metrics.columns`。`Scene3D@1.0.0`／`TransferProfile@1.0.0` 及 Preview／Export 介面不變。
- [x] 保留完整 v1 入口與原 Schema；`migrateFloorPlanV1ToV2` 補 `columns: []`，驗證升級前後 Scene3D 完全相同。契約說明：`schemas/MIGRATION-v2.md`；六份 Schema 均預編譯供瀏覽器離線驗證。
- [x] 新增柱／凹牆／孔洞／高度／材質／來源對應、精確體積與封閉網格測試；實際 PDF 13 個物件逐一對上 13 個可顯示網格，DXF 亦通過新流程。
- [x] UI 顯示「6 個柱、7 個牆區」，TAB 仍於轉換成功後才啟用；2D／3D JSON 下載按鈕及尺寸設定區維持移除。
- 開發產物：`outputs/structure-preview/{floorplan2d,scene3d,transfer-report}.json`，不放進 `web/`。`outputs/model-preview/` 保留舊 v1 回歸結果。
- 邊界：門窗、地板與家具尚未自動建模；多邊形牆的開口定位尚未支援，若輸入這類開口則回報錯誤。候選物件與比例保持未確認、僅供 preview；DAE／SketchUp 驗收仍未完成。

### 0.11 門片與 OA 區輕隔間（已完成本階段）

- [x] 門辨識置於 Extraction 的 `door-analysis.js`：在門圖層配對開門弧線、薄矩形門片、門軸與半徑；支援單段／多段 Bézier 弧線。只有弧線、沒有門片或跨出選區時不補猜測門。
- [x] 此 PDF 右上角辨識 **2 扇門**。位置、寬度、厚度與開啟方向沿用來源向量及左上 20 cm 參考比例；高度採使用者預設 **210 cm**，深木色為示意材質。左上「封門（不出入）」不當作可出入門，保留診斷。
- [x] 依使用者澄清，輕隔間新增對象是 **「新做 OA 辦公家具」區塊的空心平行線**。從活動家具圖層取得標示旁的細長封閉區域與相連端點，合併成一組 28 頂點隔板輪廓；桌面、座位空間與其他櫃體不拉高。此階段最初使用 **250 cm**；最新辦公屏風規則於 §0.14 改為 **120 cm**，淺木色顯示。
- [x] 茶水間 L 型牆與下方短牆繼續依填線規則顯示為水泥灰；不因位於木作圖層而改成輕隔間。
- [x] 新增 `FloorPlan2D@3.0.0` 的獨立 `doors` 與 `TransferReport@3.0.0` 的 `metrics.doors`；門片不偽裝成牆／柱。v2 → v3 migration 補空門陣列，保留舊版及相同 Scene3D；見 `schemas/MIGRATION-v3.md`。
- [x] Transfer 產生獨立 door group + door_leaf mesh。`existing_gap` 門片必須在既有空隙；開啟及關閉位置與牆柱碰撞即失敗，不用門遮蔽牆，也不憑空補門框、過樑或宿主牆。
- [x] 最新實際 PDF 結果為 **6 柱 + 8 個牆區 + 2 門 = 16 網格／33 節點**；8 個牆區含 3 水泥牆、5 輕隔間（其中一組為相連 OA 隔板）。2D 增加門 D1／D2 與 OA 輕隔間標記，3D 顯示實際轉換數量。
- [x] 新增門片尺寸／高度／碰撞／來源對應、封門排除、家具曲線排除、OA 桌面空白、重複線／順序／裁切穩定性、v2 migration 與實際 PDF 全流程測試。五個 Service 維持分離；Preview／Exporter 不讀門或 OA 的原始 PDF。
- 邊界：這次支援向量 PDF 指定圖層與標示慣例；DXF 門扇辨識、無圖層／無標示 OA 辨識、完整門框／過樑、窗、家具與輪廓牆切門洞仍待補。辨識、材質及比例保持待核對，正式 DAE／SketchUp 驗收仍未完成。

### 0.12 椅子與帶 X 高櫃（已完成本階段）

- [x] 使用者確認預設：**椅座 45 cm、椅背總高 85 cm、高櫃 210 cm**。寬深與平面位置沿用來源輪廓及左上 20 cm 參考比例，集中設定於 `model-defaults.js`。
- [x] `furniture-analysis.js` 為 Extraction 的獨立幾何輔助。以相連家具曲線、座面三邊及椅背弧線辨識椅子，保留旋轉朝向；本次 PDF 為 **18 椅（會議區 14、OA 區 4）**。
- [x] 依使用者規則，大框中的成對 X 對角線辨識為高櫃；必須有完整封閉外框，不能把文字 X、單斜線或重複填充當成櫃。本圖 **12 櫃（左 4、右 8）**；左側用完整外框尺寸而非內嵌 X 框，小型鐵件 X 排除並提示。
- [x] `furniture-templates.js` 提供 `builtin.chair.v1`（座面、椅背、4 腳）及 `builtin.tall_cabinet.v1`（櫃板、雙門、把手）。模板只產生毫米制通用幾何，保留家具 group 及零件 mesh；材質、模板、來源辨識互相分離，沒有將 Three.js 型別寫入契約。
- [x] `FloorPlan2D@4.0.0` 新增 level `furniture`，`TransferReport@4.0.0` 新增椅子／高櫃數量；保留 v1–v3，v3 → v4 migration 補空家具陣列，Scene3D 完全相同。契約與範例見 `schemas/MIGRATION-v4.md`、`examples/floorplan2d.v4.sample.json`。
- [x] 此階段實際 PDF 為 **46 個來源物件、232 個零件網格、279 個節點**：原 6 柱／8 牆區／2 門，加上 18 椅／12 高櫃。UI 顯示數量、CH／CB 編號及材質圖例，3D TAB 仍只於成功轉換後啟用；不恢復 JSON 下載或尺寸設定區。
- [x] `check-furniture.mjs` 驗證方向、外框尺寸、X 規則、未知模板／座高／材質／重複 ID 阻擋、零件封閉性、群組／mapping、旋轉與樓層高度、裁切／順序／重複線穩定，以及舊版升級相容。實際 PDF → v4 → Scene3D → 獨立 Preview 全流程通過。
- 共用模型路線：目前內建幾何可直接由 Three.js Preview 顯示，後續由獨立 Export 產生 DAE／GLB；這次未實作正式輸出，也未進行 Windows SketchUp 實機驗收。免費外部替換素材可考慮 Kenney Furniture Kit（CC0），來源及官方格式文件見 README。
- 邊界：椅子辨識針對此類圓角座面／椅背向量符號；不同符號、掃描圖、DXF 家具辨識仍待補。高櫃正面朝主區中心只是顯示推定，款式及材質為簡化模板；本階段未含桌面；桌面已於 §0.13 新增，其他家具、門框、窗、地板仍待處理。第 4／7 項仍維持未完成。

### 0.13 空白桌框與橢圓會議桌（已完成本階段）

- [x] `table-analysis.js` 以使用者「全空家具框當桌子」規則萃取；從封閉平行線的面合併出 **4 組 L 形 OA 桌面**，保留座位凹角；曲線輪廓組成 **1 組中央留空的橢圓會議桌**。不把外接矩形填滿，不重複建立橢圓桌的直線側板。
- [x] 家具／木作相關圖層、封閉輪廓與比例皆為必要證據；已分類牆柱／門／椅／高櫃、內部填線／X／設備符號及明確的櫃體／設備文字優先排除。曲線以小於 0.5 mm 控制誤差細分，端點只容許小量 PDF 量化誤差；跨選區及缺少外弧不能把內孔當成桌面。
- [x] 使用者桌高 **90 cm = 900 mm**（地面到桌板頂部）。`table-template.js` 生成淺木色桌板及深灰桌腳；板厚 40 mm、支撐款式與位置為顯示預設，腿保持在實際桌面輪廓內，不落入中央孔洞。
- [x] `FloorPlan2D／TransferReport v5` 新增 `table` 輪廓與桌子數量；v1–v4 原 Schema 不改，v4 → v5 migration 只改版本且 Scene3D 完全相同。桌子各自 group，桌板／桌腳各自 mesh，來源 mapping 完整；Scene3D v1、Preview／Export 介面不變。
- [x] 最新 PDF 為 **51 個來源物件、267 個網格、319 個節點**。UI 增加 5 桌、T 編號、桌面圖例及 90 cm 高度；仍無 2D／3D JSON 下載按鈕。
- [x] `check-tables.mjs` 驗證輪廓／孔洞／凹角、900 mm 高度、桌腳位置、來源 mapping、無效幾何／材質／模板阻擋、順序／重複／裁切穩定及 v4 migration。原 PDF → v5 → Scene3D → Three.js 全流程與舊版本回歸通過。
- 邊界：此版是向量 PDF 的幾何／圖層／文字規則，並非任意平面圖的完整語意理解；掃描圖、DXF 桌子辨識及正式模型輸出仍待完成。第 4／7 項不勾選。

### 0.14 辦公區屏風高度規則（已完成）

- [x] 使用者最新指定：區域有 **「辦公」** 文字，旁邊為無斜線／網格填充的空心平行隔板時，視為 **120 cm 辦公屏風**；取代 §0.11 原先 OA 區 250 cm 預設。
- [x] 文字先匹配所在家具面，再沿共享邊尋找細長隔板及相連端點；不把圖上所有平行線都當成屏風。填線和已識別水泥構件優先排除。保留來源區域文字、`semantic_type: office_screen` 與高度依據。
- [x] `office_screen_height_mm = 1200` 集中於 defaults，僅套用已辨識的辦公屏風；其他牆柱 250 cm、桌面 90 cm、椅子與高櫃預設維持原值。
- [x] 原圖 OA 區仍為同一組 28 頂點輪廓；測試確認只改高度、桌面與座位凹角不填滿、茶水間水泥牆維持 250 cm，且單純「辦公」文字、無辦公文字、填線／實體優先規則皆有回歸案例。

### 0.15 物件字典與櫃子高度（已接入辨識與預覽）

- [x] `web/config/object-catalog.json` 獨立保存類型、別名、場景分類、櫃高與模型對照；現為 v0.2.0、53 種物件。保留最初 10 種設備、8 種櫃子及通用櫃子，經使用者確認再增加 34 種居家、咖啡廳、飲料店、學校及共用空間物件，另保留辦公室分類。
- [x] 名稱先 NFKC 正規化、去空白；含「櫃／柜」優先歸櫃子，再以最長別名匹配子類。未標名大空框＋成對 X 維持高櫃規則；場景名稱只用於整理字典，不會因為看見「咖啡廳」就自動增加設備。
- [x] 三組櫃高實際套用：含 **小／矮 → 900 mm**；**高櫃／衣櫃 → 2100 mm**；**其餘 → 1500 mm**。小／矮優先，半高櫃先於高櫃判斷；小衣櫃 900 mm、系統半高櫃及茶水櫃 1500 mm。
- [x] 櫃類使用內建 `builtin.cabinet.v1` 簡化櫃體；設備與新增家具尚未選模型時，以 **400 mm 方塊、浮於地面或承載檯面上 100 mm** 顯示原名。六面文字跟隨同一個獨立物件；此尺寸不代表設備實際大小。
- [x] `catalog-analysis.js` 依文字與家具圖層的封閉框線配對，包含規律重複虛線；名稱標籤與物件框 source refs 同時保留。新字典物件優先排除空框桌子辨識，避免沙發等被誤列為桌。
- [x] 使用較小物件的定位點、較大桌／櫃的有效檯面輪廓建立 `support_id`。Transfer 驗證同樓層、存在的承載物、有效輪廓與孔洞，再依檯面高＋浮高生成；不將缺失或循環參照默默落到地面。來源框跨越檯面邊界時列為待核對。
- [x] 取得外部模型及整理授權、引用、本機路徑與原始尺寸；46 個 GLB 對應 50 種物件來源，3 種缺項，詳見 §0.17。
- [x] 支援純色外部模型的尺寸換算、共用 Scene3D 接入與承載放置，原 PDF 的 24 個物件已於 §0.18 完成預覽驗證。
- [ ] 全部素材逐件款式／正面方向／材質驗收，以及貼圖、動畫姿態與其他來源格式支援。
- [x] §0.19 的 DAE Export 保留獨立物件與六面標籤貼圖。
- [ ] 實測 Windows SketchUp 選取／刪除／替換。不能把 Three.js 預覽或 DAE 格式驗證當作 SketchUp 驗收。

### 0.16 名稱辨識 → 3D 初稿驗證（已完成本階段）

- [x] FloorPlan2D／TransferReport v6 新增 `cabinet`、`placeholder` 與統計；v1–v5 Schema 不變，v5 升級只改版本，舊 Scene3D 幾何完全相同。契約與 migration 見 `schemas/MIGRATION-v6.md`。
- [x] Scene3D v1 保留獨立 group／mesh、來源 mapping、毫米世界座標；方塊六面以 `semantic.face_labels` 保存面索引與原文字。Preview Service 產生六面文字貼圖與 UV；IR 不含 Three.js 型別。
- [x] 原始 PDF 新增 6 個具名櫃體、12 個標名方塊；含原有結果共 **69 個物件／333 個網格／403 個節點**：6 柱、8 牆區、2 門、18 椅、18 櫃、5 桌、12 標名方塊。
- [x] 飲水機／烘碗機置於茶水櫃上，3 台印表機有承載櫃；其中跨櫃邊界的一台標示待核對。「電鍋 X2」依使用者要求加入 `ignored_object_labels`，不生成、不列待核對提示；雨傘架／海報機不在字典，依框內原名建立待核對方塊。
- [x] `check-catalog.mjs` 驗證 53 類別／別名、櫃高優先序、原圖配對、桌上設備高度、六面文字／UV／朝外面向、來源 mapping、排序／重複／裁切穩定、承載與幾何失敗案例、v5 migration、strict／Export 初稿阻擋。十四份 Schema 範例與舊管線回歸通過。
- [x] 本機網頁讀入原 PDF、轉換成功，3D TAB 啟用；69 個候選、18 櫃、12 標名方塊與尺寸說明可見。截圖 `.local/catalog-3d-preview.jpg`，瀏覽器無 console error。
- 邊界：目前是向量 PDF 家具圖層內的軸向封閉框配對；未提供 AI、OCR、任意旋轉／曲線設備框或完整房間語意推論。新項目已驗證名稱規則與合成框線，未宣稱以居家／店面／學校各類真實圖面驗收。全部原圖候選保持未確認；第 4／7 項維持未勾選。

### 0.17 免費模型取得與引用（素材階段已完成）

- [x] 已保存 **46 個自包含 GLB、1,804,048 bytes（約 1.8 MB）**：Kenney Furniture Kit 23 個、3DAssets.dev 23 個。來源宣告皆為 CC0-1.0；保留作者、來源頁、授權、引用文字、SHA-256 及原包／下載資訊。詳見 `MODEL_SOURCES.md` 與 `web/assets/models/CREDITS.md`。
- [x] `web/config/model-assets.json` 獨立保存素材資料；53 種物件分為 33 種類別符合、6 種通用造型、11 種款式待核對、3 種缺項。共享模型只保存一份，50 種來源參考不代表 50 種精確款式。
- [x] `object-catalog.json` 的 `reference_asset_id` 連到素材庫，原 `model_id` 仍為目前模板。`model-asset-service.js` 提供讀表、查本機 URL 與引用清單；保持獨立服務，不更動 Reader／Extraction／Transfer／Preview／Export 或 IR 契約。
- [x] 逐檔檢查 GLB 2、雜湊、自包含 buffer／圖片、可解碼頂點、節點變換、原始尺寸與三角形數。來源 glTF 為公尺／Y-up，量測尺寸不是使用者確認的物件尺寸；仍須依已確認高度、圖面比例與承載關係處理。
- [x] 3DAssets.dev 的本次 23 個模型均由來源標示 AI 協助製作，保留聲明；網站執行不需 AI API。Kenney 未聲明此欄位，以 null 保存，不推定製作方式。
- [x] 明確保留 **烘碗機、飲料杯封口機、煮茶機**缺項；不以名稱相近的不同設備冒充。落地桶裝飲水機另標款式差異，不自動替換本圖檯上飲水機。電鍋 X2 維持忽略。
- [x] §0.18 已接入純色模型；素材表以逐類 `runtime_enabled` 控制，37 類／34 個獨立素材可參與預覽，其餘款式差異、缺項與貼圖模型保持停用。
- [ ] 素材庫全部模型的逐件瀏覽器外觀／材質、姿態及實際款式驗收；原 PDF 以外的候選來源不能視為已實測。
- [x] §0.19 已把目前使用的模型與來源引用輸出至 DAE ZIP。
- [ ] Windows SketchUp 匯入與獨立選取／刪除／替換驗收；第 7.2 項維持未完成。

### 0.18 依自身圖框配置模型（已接入預覽）

- [x] 使用者確認採 **物件自身外框＋既有左上牆厚 20 cm 比例** 換算；不乘 0.9、不從附近未配對文字猜尺寸。承載桌／櫃用於定位高度與範圍核對，框線尺寸仍為圖面推估而非產品規格。
- [x] 設備採 `s = min(框寬 / 模型原寬, 框深 / 模型原深)`，三軸等比例縮放並置中於原框；比例不同時留白。櫃體分別配合框寬／深，高度維持 90／150／210 cm。限無孔洞矩形物件框；無效尺寸與外框不一致時拒絕。
- [x] `model-selection.js` 為 Extraction 輔助；`buildStructurePlan(..., {modelCatalog})` 產生 v7 的獨立 `model_object`。舊 v1–v6 不改；v6 → v7 空升級的幾何保持相同。契約與 golden fixture 見 `schemas/MIGRATION-v7.md`、`examples/floorplan2d.v7.sample.json`。
- [x] 獨立 `model-geometry-service.js` 讀本機 GLB、校驗 SHA-256、處理量化 accessor／預設節點姿態及 m／Y-up → mm／Z-up，輸出通用局部 Scene3D。Transfer 只吃通用幾何，將縮放、旋轉及位置烘焙到世界座標；Preview 與 Export 共用同一份 Scene3D，沒有只出現在畫面的模型。
- [x] 模型落地或放在同樓層桌／櫃頂面；實物模型不沿用方塊的 10 cm 浮高。保留獨立物件群組、來源 mapping、尺寸依據及素材引用；缺失／循環／無效承載阻擋，跨檯面邊界保留警告。
- [x] 原 PDF 實際生成 **24 個套用模型的物件（18 櫃體＋6 設備）**，設備為 3 台印表機、冰箱、碎紙機、影印機；剩餘 6 個標名方塊。合計仍為 69 個來源物件，輸出 **301 網格／371 節點**。三台印表機模型底部均在承載櫃頂 1500 mm；跨櫃的一台仍提示待核對。
- [x] 37 類／34 個純色素材可載入；烘碗機／封口機／煮茶機、款式待核對及含貼圖者不自動替代。落地飲水機不放上茶水櫃；未知雨傘架／海報機保留標名方塊。電鍋 X2 持續忽略。
- [x] 原 PDF 自動管線、等比尺寸、櫃高、地面／承載高度、錯誤參照／雜湊／載入失敗、v6 migration、16 份契約及既有核心回歸通過。本機重新讀檔後，3D TAB 轉換成功才啟用；24 個模型可見，旋轉／縮放與 PNG 下載正常，console 無 error/warn。
- [x] Preview 對連續同材質、無標籤的面合併繪製批次，避免每個三角形一次 draw call；六面文字方塊仍保留逐面 UV。
- 材質保留來源純色，使用靜態預設姿態與平面法線；金屬度／粗糙度、來源平滑法線與動畫尚未保留。34 個來源共含 116 個零面積三角形，載入時移除並記錄數量；其他索引／數值錯誤不略過。外部模型視為三角形表面，不冒充已驗證封閉實體。
- 原生模型正面方向仍為估計，完整素材庫未逐件驗收。外部模型由 preview 生成，strict 仍阻擋；§0.19 已提供明示初稿下載，Windows SketchUp 匯入／編輯驗收待完成。開發輸出為 `outputs/asset-preview/`，預覽圖 `.local/asset-model-preview.png`。

### 0.19 SketchUp 2025 編輯初稿下載（輸出已完成，實機驗收待完成）

- [x] 使用者指定 SketchUp 2025；先輸出 COLLADA **1.4.1 DAE**。不宣稱存在適用全部軟體／版本且無損的單一格式；未來 GLB／OBJ／SKP 由 Export 擴充，Reader／Extraction／Transfer／Preview 與 IR 契約保持獨立。
- [x] 網頁新增「下載 SketchUp 編輯初稿」，模型成功顯示後啟用；打包期間停用，改檔／改頁／改選區會取消舊結果的下載資格。沒有 JSON 下載按鈕。
- [x] `export-service.js` 編排 `export/dae-exporter.js`、`label-textures.js`、`zip-artifact.js`；瀏覽器內生成 DAE、PNG、ZIP，不依賴伺服器轉檔、Three.js exporter 或本機工具。
- [x] `export3D` 預設 `mode: 'validated'` 仍拒絕 `preview_only`；本次使用者要求的下載明示 `mode: 'draft'`，保留未確認比例／辨識、初稿 metadata 與診斷，不更動輸入 Scene3D。幾何、材質、階層或資產無效時仍失敗，不回傳不完整檔案。
- [x] 原 PDF 匯出 **69 個物件群組＋1 個樓層群組、301 網格、14,289 三角形、42 材質、6 張 PNG**。設備模型與 6 個六面標名方塊皆保留獨立節點；標籤為貼圖，不是 SketchUp 原生文字。
- [x] ZIP 共 9 檔：`model.dae`、`textures/label_1.png` 至 `label_6.png`、`README.txt`、`CREDITS.txt`。貼圖使用相對路徑，附實際採用的模型來源／授權／雜湊；不含原 PDF、DXF 或 JSON。測試產物約 2.8 MB，位於 `outputs/sketchup/twothreeD-editable-draft.zip`。
- [x] 使用 `<unit meter="0.001">` 與 `Z_UP` 保留毫米世界座標，不重複套用比例或承載高度。保留群組階層、原 ID／來源語意、純色與透明度；依 COLLADA NCName 規則處理節點名稱，原名稱另存 metadata。多邊形三角化後檢查面積與法線，保留凹角及既有孔洞。
- [x] `check-export.mjs` 驗證已知尺寸 fixture、原圖模型、ZIP CRC、PNG、來源不可變、固定時間輸出確定性，以及缺貼圖／非法索引／退化面／循環階層／錯誤材質等拒絕行為。`check-dae.py` 獨立讀回 XML，逐頂點核對座標、面積、面向、父子關係與資產參照。
- [x] 官方 COLLADA 1.4.1 XSD 驗證通過；本機瀏覽器重新讀取原 PDF、轉換及實際下載成功，下載包亦通過 XSD，中文 PNG 可正常顯示，console 無 error/warn。驗證不代表 SketchUp 實機編輯已完成。
- [ ] 在 Windows SketchUp 2025 匯入、核對 5 m／150 mm／2.8 m 牆與 900 mm 門洞 fixture、獨立修改牆／地板、替換方塊、另存 SKP 並重開。本機沒有 SketchUp 可執行程式，尚未做此項測試。
- 邊界：只匯出目前生成的幾何；尚未辨識的窗、地板等不會補造。保留三角面與基礎材質，未保留原始 n-gon、PBR、動畫或原生參數化／動態元件；來源 GLB 貼圖仍明確不支援。

### 0.20 原創設備模型與飲水機款式判斷（已完成）

- [x] 使用者確認補上 **烘碗機、飲料杯封口機、煮茶機、檯上飲水機**。以 `scripts/generate-model-assets.mjs` 程式化生成原創、無品牌的通用幾何，模型採 CC0-1.0；產物是自包含 GLB，不是平面貼圖。原始碼、生成版本、原生尺寸、來源聲明與 SHA-256 皆保存。
- [x] 四個 GLB 位於 `web/assets/models/generated/`，合計 **381,344 bytes**，共 153 個零件、5,712 三角形；保留純色材質、烘碗機透明門與零件名稱。模型尺寸是外形比例參考，不當成使用者確認的實物尺寸，沿用自身框的等比容納與承載高度，不乘 0.9。
- [x] `model-assets.json` 的飲水機預設來源保留既有落地桶裝款，新增 `placement_variants.on_support` 指向檯上款。`model-selection.js` 依 Extraction 的 `support_id` 選擇：桌／櫃頂承載 → 檯上款；無承載 → 落地款。壞參照仍交 Transfer 阻擋，不悄悄降到地面；不以「茶水間」文字或畫面上下位置猜測承載。
- [x] 來源服務明確區別 generated／downloaded，原創來源連到本機 `SOURCES.txt`，不捏造下載網址或外部作者。53 種物件現在皆有模型來源參考；41 類／39 個素材可用，另有款式差異及貼圖限制者仍停用。原有 46 個外部 GLB 未修改，另加 4 個原創模型。
- [x] 原 PDF 重新計算後，烘碗機與飲水機都放在茶水櫃頂 **1500 mm**；模型約為 **617×504×597 mm**、**430×453×686 mm**，由原圖框推估。來源物件仍為 69 個，現為 **26 個套用模型、4 個標名方塊、391 網格／461 節點**；原圖沒有封口機或煮茶機，不額外插入。
- [x] 新增 `model-library.html` 與獨立頁面編排 `model-library.js`，重用 Preview Service，展示四款原創模型及既有落地飲水機，可旋轉並下載各自 GLB／DAE ZIP。工作室提供模型庫連結。單獨模型包為 `outputs/generated-models/twothreeD-original-appliances.zip`，含四款 GLB／DAE、生成程式與來源說明。
- [x] `check-generated-models.mjs` 驗證四款原生尺寸、閉合邊配對／正向體積、無退化面、獨立 DAE 群組，以及桌／櫃／落地選款與高度、無效承載拒絕。模型來源、v7 圖面管線、16 份契約、v6 回歸、DAE／ZIP／獨立 XML 讀回通過；四款單獨 DAE 與整圖通過官方 COLLADA 1.4.1 XSD。
- [x] 瀏覽器逐款查看外觀，單獨檯上飲水機下載成功；重新載入原 PDF、3D 預覽及整圖下載成功，畫面為 26 模型／4 方塊，console 無 error/warn。新版整圖 ZIP 約 **3.3 MB**，保留 69 物件群組、17,625 三角形、51 材質與 4 張標籤 PNG。
- 邊界：飲水機選款正確與否仍依承載辨識結果；沒有識別出承載時會選落地款。模型是通用外觀與可替換幾何，沒有機械動作、產品級精度或原生參數化功能。SketchUp 實機匯入／編輯仍為第 7.2 項待驗收。

### 0.21 支架白板與完整標示尺寸（已完成）

- [x] 依使用者最後確認，**一般白板與電子白板皆採支架式**；一般白板 W140×D65×H193 cm，電子白板 W130×D85×H176 cm，取代先前壁掛與預設高度方案。
- [x] 原創模型包含板面、框、筆槽、支架、腳輪；電子白板另有控制面板。兩款 GLB 共 126,236 bytes，24／27 零件，792／912 三角形。沿用可重建原始碼、CC0、SHA-256 與本機來源聲明。
- [x] `object-catalog.json` 分開匹配電子白板與一般白板；共 54 類。素材表共 52 個 GLB，43 類／41 個素材可選用。原壁掛白板素材保留，不作本次自動替換。
- [x] 獨立 Extraction 輔助 `board-dimensions.js` 解析完整 W/D/H 與 mm／cm／m；只有唯一鄰近、水平位置相符的尺寸可配對，保留文字來源。不用單獨數字猜尺寸；缺失、歧義或不完整標示保留標名方塊。薄板輪廓與相接支架共同確定定位外框。
- [x] FloorPlan2D／Report v8 增加 `equipment_dimensions`，依標示的完整寬深高配置；原校正輪廓存入 metadata，其他設備沿用自身框等比容納。v1–v7 schema 不變，v7 → v8 migration 不改既有 Scene3D；Scene3D 維持 v1，Preview／Export 共用。
- [x] 原 PDF 轉換為 **28 模型物件（18 櫃＋10 設備）、2 標名方塊、440 網格／510 節點**；白板皆落地，尺寸分別精確為 1400×650×1930 mm、1300×850×1760 mm。其餘兩個方塊是海報機、雨傘架；電鍋 X2 維持忽略。
- [x] `check-boards`、原創模型閉合與尺寸、模型來源、原圖轉換、v6 回歸、18 份契約、v7 migration、DAE／ZIP／獨立 XML 讀回及官方 COLLADA 1.4.1 XSD 通過。新整圖 DAE 為 69 物件群組、19,305 三角形、60 材質、2 PNG，Node ZIP 為 3,624,402 bytes。
- 白板尺寸優先採完整文字標示，原 20 cm 參考比例仍用於其他輪廓；不同圖面上的名稱、朝向與尺寸配對仍待核對。SketchUp 2025 實機匯入／編輯驗收維持第 7.2 項未完成。

### 0.22 無字紅色方塊與單一 DAE（已完成）

- [x] 依使用者最新要求，缺少模型時改為**六面無字的紅色立方體**；邊長 40 cm、離地／檯面 10 cm 維持。模型群組仍有原物件名稱，可單獨選取、刪除、替換；沒有生成文字貼圖。
- [x] 本次 v8 契約加入 `builtin.marker_cube.v1`，與舊 `builtin.labeled_cube.v1` 明確分開；Scene3D 用 `label_mode: none` 表達純色，保留名稱／來源與支撐關係。Preview 與 Export 對混入標籤或少面的方塊拒絕；舊版標名方塊與 ZIP 輸出保持相容。
- [x] Export Service 新增 `container: dae`，直接回傳 `.dae`、COLLADA MIME 與單一檔案，無 ZIP／PNG。若 Scene3D 仍引用外部圖片會拒絕單檔輸出，不遺失資源；名稱、模型作者、來源、授權與雜湊保留於 DAE metadata。
- [x] 工作室與模型庫下載按鈕改為 DAE；說明採「SketchUp 檔案 → 匯入」，不再提示解壓縮。原 PDF 仍有 69 物件群組、28 模型與 2 紅色方塊（海報機、雨傘架）；440 網格、510 節點、19,305 三角形、58 材質、0 外部圖片。
- [x] v8 golden fixture 包含兩款白板與純色方塊。自動驗證方塊尺寸／浮高／紅色／無 Canvas 文字貼圖、Preview 與 DAE 同一幾何、單檔無 image／UV 引用、引用資訊完整、舊標籤 ZIP 兼容與外部資源拒絕。十八份契約、原圖管線、獨立 XML 讀回與官方 COLLADA XSD 通過。
- [x] 本機瀏覽器原 PDF 預覽／下載通過，實際取得單一 DAE（3,589,226 bytes）、0 外部圖片，官方 XSD 通過且 console 無 error/warn。
- 已下載的舊 ZIP 不會自動改變；需重新轉換並下載新版 DAE。SketchUp 2025 桌面版使用 DAE 匯入，實機編輯仍列第 7.2 項待驗收。

### 0.23 自製模型共用配色（已完成）

- [x] 使用者確認同款模型共用顏色、只改主要外殼。六款原創模型提供選色器、六位 HEX 輸入、套用與恢復原色；設定保存於同站瀏覽器 localStorage，模型庫與整圖頁透過 storage 事件同步。
- [x] 改色範圍獨立存於 `web/config/model-appearance.json`：烘碗機／檯上飲水機外殼、封口機機身、煮茶機加熱機身外殼、一般／電子白板的板框。白色書寫面、透明玻璃、碗盤、金屬配件、支架、按鈕等維持原材質；缺模型的紅色方塊不參與改色。
- [x] 獨立 `model-appearance-service.js` 讀設定、驗證色碼、sRGB → linear RGB、保存偏好並從原始 Scene3D 複製配色結果；只替換指定零件的材質參照，不修改來源 GLB、幾何、比例、位置或階層。`model-color-controls.js` 只處理共用操作介面。
- [x] 主畫面「3D 預覽 → 模型配色」顯示本圖可改色的模型；模型庫顯示所有六款。改色保持視角，Preview 與 Export 使用同一份配色後的 Scene3D，DAE metadata 記錄 HEX／零件範圍／原來源引用。模型庫 GLB 明示為原始 GLB，配色版下載用 DAE。
- [x] 無效 HEX 不套用；localStorage 失效時仍可當次改色並提示無法保存。從保留的原始場景重建每次配色／重設，避免多次修改累加。兩份 IR 的既有欄位與 schema 版本不變。
- [x] `check-model-colors` 驗證六款、原色值、sRGB 數值、錯誤色碼／儲存、來源不可變、受保護零件、同款多物件、恢復原色、Preview 與 DAE 顏色一致。18 份契約與預覽回歸通過。
- [x] 瀏覽器實測烘碗機藍色 #0077CC、白板板框橘色 #E67E22，跨頁同步、主圖初始化讀取偏好、無效色碼提示、單款與整圖 DAE 下載及恢復原色成功；console 無 error/warn。整圖下載 510 節點、0 外部圖片，配色 metadata 完整，官方 COLLADA XSD 通過。測試完還原原色，示範截圖 `.local/model-colors-preview.jpg`。
- SketchUp 實際顯示色差、群組編輯與另存重開仍屬第 7.2 項待驗收；不宣稱所有軟體的光照／色彩管理完全一致。

### 0.24 GitHub Pages 部署

- [x] 儲存庫 `WU-YU-HUA/TwoThreeD` 的 `main` 使用 GitHub Actions；工作流程只發布 `web/`，不包含原始 PDF、測試與開發輸出。
- [x] `tests/check-static-site.py` 驗證 `/TwoThreeD/` 專案子路徑、HTML 與 JavaScript 模組參照、52 個模型 SHA-256、PDF worker／字型／WASM 依賴，沒有新增網站後端或外部轉檔服務。
- [x] 部署使用官方 checkout／configure-pages／upload-pages-artifact／deploy-pages，限定 Pages 寫入與 OIDC 權限；main 網站變更自動部署，支援手動觸發，並行部署排隊。
- [x] 啟用儲存庫 Pages、完成首次 Actions 發布，驗證 HTTPS 線上入口與模型庫：<https://wu-yu-hua.github.io/TwoThreeD/>（2026-11-16，Actions #1 成功）。
- [x] 線上網站載入 DXF 範例及原 PDF、產生 3D、下載 DAE；PDF 共 69 物件／28 模型／2 紅色方塊，下載檔通過 COLLADA XSD，瀏覽器未觀察到資源 404 或 console error／warn。

## 1. 目標與驗收邊界

### 1.1 產品目標

從建築／室內平面圖（預覽先支援 PDF / DXF；建築語意辨識先從 DXF 開始，向量 PDF 後續加入）擷取結構化的室內格局，生成可被 Windows 版 SketchUp 匯入、移動、分組、編輯面與邊線、替換材質的 3D 模型。**最終不必一定產生 `.skp`：DAE 匯入後在 SketchUp 另存 SKP 也是可接受路徑。**

### 1.2 MVP 包含

1. 網頁選檔、設定及預覽，顯示辨識錯誤並允許手動確認。
2. DXF → **FloorPlan2D IR v1**，辨識直線牆、矩形門窗開口、簡單地板輪廓與房間。
3. **Transfer Engine**：FloorPlan2D IR → **Scene3D IR v1**，生成牆的實體幾何、門窗開口、地板、物件階層、材質參照。
4. 第一個 Exporter 可採 DAE；另以相同 Scene3D IR 對接 Ruby importer 或 SketchUp C SDK exporter。
5. 可輸出 `floorplan2d.json`、`scene3d.json`、`transfer-report.json`，便於除錯及替換實作。
6. 匯入 Windows SketchUp 後能獨立選取牆與地板群組，修改材質及幾何。

### 1.3 MVP 不包含

- 全自動、高準確度 OCR 及掃描圖面語意辨識；掃描式 PDF 是後續 Adapter。
- 曲線牆、複雜斜牆連接、樓梯／多層樓貫穿、家具細節／BIM 參數化元件。
- SketchUp 原生「動態元件」或保證可保留原始 CAD/BIM 的參數化歷程。
- 透過破解、逆向私有 SKP 格式，或使用未授權 SDK 產生 SKP。

## 2. 系統模組與固定邊界

```text
Browser GUI
   ↓ readFile
File Reader Service (PDF | DXF | future formats)
   ↓ source document（內部來源格式）
Extraction Service
   ↓ FloorPlan2D IR v2 ← 契約 A；柱與輪廓牆；保留 v1 相容入口
Transfer Service
   ↓ Scene3D IR v1 + TransferReport ← 固定契約 B；已實作核心，未確認物件僅供 preview
   ├─ Preview Service → Three.js 畫面／視角 PNG
   └─ Export Service  → DAE／未來其他格式 → 使用者自行匯入 SketchUp
```

**禁止讓 GUI 或 InputAdapter 直接呼叫某個特定的 exporter。** 每個 exporter 必須只讀取 `Scene3D`（及明確傳入的資源檔），不得自行重新解析 PDF/DXF。

### 2.1 模組責任表

| 模組 | 輸入 | 輸出 | 可替換條件 |
|---|---|---|---|
| `FileReader` | File + 讀取設定 | 內部 source document | 副檔名 handler 與解析資源生命週期 |
| `Extraction`（原 InputAdapter 語意部分） | source document + 萃取設定 | 證據／正式 `FloorPlan2D` | 正式成果須通過 FloorPlan2D schema + 語意驗證 |
| `PlanReview` | `FloorPlan2D` + 使用者修正 | 仍為 `FloorPlan2D` | 不更動資料契約 |
| `TransferEngine` | `FloorPlan2D` + `TransferProfile` | `Scene3D` + `TransferReport` | 通過幾何與對應追溯測試 |
| `ScenePreview` | `Scene3D` | 瀏覽器 3D 畫面／PNG | 不改模型契約與世界座標 |
| `SceneExporter` | `Scene3D` + `ExportOptions` | 路徑 / 成功狀態 / 診斷 | 通過 SketchUp 匯入／編輯驗收 |
| `GUI` | 使用者動作與各階段結果 | 預覽／確認／匯出 | 不引入 CAD、C SDK、Ruby 特有資料型別 |

## 3. 契約 A：FloorPlan2D IR（v1 相容、v2 擴充）

**正式 JSON Schema**：`schemas/floorplan2d.v1.schema.json` 與 `schemas/floorplan2d.v2.schema.json`。以下保留 v1 規則；v2 新增柱／輪廓牆與升級策略見 §0.10 及 `schemas/MIGRATION-v2.md`。
**參考資料**：`examples/floorplan2d.sample.json`。

### 3.1 基本約定

- 頂層 `schema = "FloorPlan2D"`，`schema_version = "1.0.0"`。
- **所有對外契約的距離都統一為毫米（`mm`）**；平面座標為 `[x, y]`，X 向右、Y 向上，右手系。不得留 PDF 點數、CAD 英吋或 UI 像素於 `*_mm` 欄位。
- 圖面來源座標 → 標準座標的仿射矩陣放在 `source.source_to_model_3x3`，使用 **row-major、左乘列向量 `[x,y,1]^T`**；`FloorPlan2D` 的元素座標已完成轉換，Transfer **不得再次套用** 此矩陣。
- 若 PDF 比例不明或無法核實，`source.scale_verified = false`；嚴格模式不得產生正式 3D。比例須由已知尺寸、標示比例、校正點或人工確認取得，不能默默假設 1:1。
- 2D 平面不承諾原始線條就是牆：輸出的是**已辨識建築語意**，不是未分類 CAD primitives。
- `source_refs` 保留原始實體／圖層／頁碼資訊；新建的人工物件允許空陣列。
- 每個 `id` 在專案中跨所有類型必須唯一且穩定；不得以當次遍歷索引直接當成長期 ID。

### 3.2 主要實體

| 實體 | 必要幾何／欄位 | 定義 |
|---|---|---|
| `Level` | `id`, `base_elevation_mm`, `walls`, `openings`, `slabs`, `rooms` | 一個樓層及其物件容器 |
| `Wall` | `id`, `start_mm`, `end_mm`, `thickness_mm`, `height_mm`, `alignment`, `material_id` | 起點→終點**中心線**；`alignment` v1 僅 `center`，厚度對稱展開 |
| `Opening` | `id`, `kind`, `wall_id`, `offset_from_start_mm`, `width_mm`, `height_mm`, `sill_height_mm` | 沿牆**起點到終點**方向量取水平偏移；窗台高／門底高自牆底起算 |
| `Slab` | `id`, `boundary_mm`, `holes_mm`, `thickness_mm`, `top_elevation_mm`, `material_id` | XY 面多邊形；頂面 Z 為 `Level.base_elevation_mm + top_elevation_mm`，厚度向下 |
| `Room` | `id`, `name`, `boundary_mm`, `holes_mm` | 空間語意範圍；v1 不直接生成獨立實體，供命名／驗證／後續家具配置 |
| `Material` | `id`, `name`, `color_rgba`, `texture_uri?` | 材質 ID 唯一；`texture_uri` 若有，應指向隨專案打包的相對資源 |

- `boundary_mm` 為不重複首尾點的頂點環，外環逆時針（CCW），洞環順時針（CW）。
- `Wall.height_mm` / `thickness_mm` 與 `Opening.width_mm` / `height_mm` 必須 `> 0`；`offset_from_start_mm`、`sill_height_mm` 必須 `>= 0`。
- 開口須滿足 `offset + width <= wall.length`、`sill + height <= wall.height`；同一牆體的開口實體不得重疊。
- 所有門窗必須有合法 `wall_id`，所有材質參照必須存在，樓層物件與彼此的 ID 不可衝突。
- `confidence` 僅代表辨識信心；正式匯出須 `confirmed = true`，或經 PlanReview 核准。不得以高信心值取代確認規則。
- 任一物件若語意未解決，需產出 `diagnostics`，不得默默轉成牆體或直接丟棄。

### 3.3 來源差異與解析策略

| 輸入 | 建議讀取路徑 | 限制與校正 |
|---|---|---|
| DXF | 瀏覽器 `dxf-parser`；`ezdxf` 可作為離線參考實作 | 解析 LINE / LWPOLYLINE / ARC / BLOCK / LAYER；需處理 block transform、單位、重複線 |
| DWG | 目前不支援；使用者自行準備 DXF / PDF | 產品不串接本機轉檔工具 |
| 向量 PDF | PDF.js 先做顯示／文字擷取；後續另外實作向量語意 Adapter | 頁面常以點數與 Y 向下座標表達；需校正比例與翻轉 Y 軸 |
| 掃描 PDF | 支援原始頁面預覽；自動辨識未列入 MVP | 轉換成建築語意仍需影像／文字辨識、人工確認比例 |

## 4. 固定契約 B：Transfer 2D → 3D

**Transfer 輸入**：`FloorPlan2D@1.0.0` + `TransferProfile@1.0.0`。
**Transfer 輸出**：`Scene3D@1.0.0` + `TransferReport@1.0.0`；失敗時輸出診斷，不發布有效 Scene3D。
**正式 JSON Schemas**：`schemas/transfer-profile.v1.schema.json`、`schemas/scene3d.v1.schema.json`、`schemas/transfer-report.v1.schema.json`。

### 4.1 Transfer 不得依賴輸出格式

在 Python 內建構幾何時，不得引用 `SketchUpAPI`、Ruby 物件、COLLADA XML 節點；C++ 未來實作也必須遵守同樣的輸入／輸出 JSON Schema。只處理向量、拓樸、開口布林運算、面與材質等通用模型資訊。

### 4.2 嚴格轉換規則

1. **座標與單位**：輸出 `Scene3D` 同樣以 mm 記錄，X/Y 與平面一致，Z 向上；右手系；所有 mesh 頂點採**世界座標**，v1 不再套 local transform，避免 exporter 重複轉座標。
2. **樓層**：`z_base = level.base_elevation_mm`。
3. **牆體**：由中心線、厚度、高度建立具體積的牆體；基底 `z_base`，頂部 `z_base + height`。牆線長為 0 則報錯。
4. **開口**：沿牆中心線取 `[offset, offset+width]`，Z 區間 `[z_base+sill, z_base+sill+height]`，需**真正從牆體幾何切空**，不可只畫門的貼圖或以物件遮住牆。
5. **地板**：沿 `Slab.boundary_mm` 建造厚度，頂部為 `z_base + top_elevation_mm`，洞環不生成實體；驗證多邊形無自交及面方向。
6. **牆角連接**：`wall_join_policy=butt` 先支援基礎分段；多牆接點可能產生可見接縫或重合面，需於報告標示。`miter` 是預留選項，未實作時必須回覆 `E_UNSUPPORTED_OPTION`，不能偷用 `butt`。
7. **幾何**：至少保留可供實際匯出的頂點與面，面頂點順序遵循外側法線的一致環繞方向。交叉、自交、退化面、索引越界必須驗證。
8. **材質**：以 `material_id` 在面上指定，不直接寫 RGB 至 exporter 專用欄位；不存在的材質 ID 報錯。
9. **語意與追溯**：所有由牆／地板生成的 scene nodes 必須保留 `source_2d_ids`，並在 `semantic` 保留尺寸、來源對象或開口資訊，避免匯出後只剩不可追溯的網格。
10. **物件組織**：`Scene3D.nodes[]` 的 `parent_id` 只表示物件階層；不代表幾何座標轉換。應以牆為父群組，牆區段為子實體；地板等為獨立物件。
11. **不可悄悄遺失**：不支援的物件、無法重建的開口、未知比例、無法產生的合法面，應在 TransferReport 記錄錯誤並停止正式匯出。
12. **確定性**：相同 FloorPlan2D + Profile + Engine 版本須生成內容等價、ID 穩定的 Scene3D；序列化應採穩定排序以利 diff。

### 4.3 Scene3D 節點格式與 SketchUp 可編輯性

`Scene3D.nodes[]` 每個節點包含：

- `id`、`name`、`kind`、`parent_id`：供 SketchUp 建立可區分的群組／元件。
- `source_2d_ids`：回查 2D 建築元素。
- `mesh`: `{vertices_mm: [[x,y,z],...], faces: [{indices: [...], material_id: "..."}, ...]}`，或在純父群組使用 `null`。
- `semantic`: 保存 `wall_id`、厚度、門窗 ID 等可推導屬性；是資料交換資訊，**不能保證 SketchUp 自動產生動態參數元件**。
- `editable`: 意圖標記。**這不是 SketchUp 編輯能力的保證**；仍須通過實際匯入驗收。

本版不使用 mesh transforms，所有頂點已是世界座標；有階層但沒有額外幾何平移。Exporter 不得套用 `source_to_model_3x3`。

### 4.4 TransferReport

最少包含：

- `status`: `success | failed`
- `mapping[]`: `source_2d_id` → `generated_node_ids[]`，`method` 可為 `solid | cut | group | derived`
- `diagnostics[]`: `severity`、`code`、`message`、`element_id`
- `metrics`: 牆、開口、地板及 3D node 數量

**必須保證 Traceability**：例如 `opening_001` 對應 `node_wall_header`（因為此節點是切除開口後生成的上緣區段）；即使開口沒有獨立實體，也不得在報告中消失。

## 5. Exporter 可替換性規範

### 5.1 統一介面（語意，實作可為 Python/C++/Ruby）

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

@dataclass(frozen=True)
class ExportResult:
    success: bool
    output_path: Path | None
    diagnostics: list[dict]

class InputAdapter(Protocol):
    def parse(self, source_path: Path, settings: dict) -> dict: ...  # FloorPlan2D

class TransferEngine(Protocol):
    def transfer(self, floorplan2d: dict, profile: dict) -> tuple[dict, dict]: ...
    # return Scene3D, TransferReport；失敗時使用明確例外／失敗報告

class SceneExporter(Protocol):
    def export(self, scene3d: dict, output_path: Path, options: dict) -> ExportResult: ...
```

`dict` 只是語言中立的傳輸示例；實務可由 Pydantic 型別承接，但 **JSON Schema 是跨語言的最終契約**。

### 5.2 各種 Exporter

| Exporter | 運作方式 | 必須保留 | 不保證 |
|---|---|---|---|
| `DaeExporter` | 瀏覽器 JavaScript 序列化 COLLADA 1.4.x | 結構化 node 名稱、分組、面與材質 | SketchUp 導入後維持完全原生／參數化行為 |
| `RubyBridgeExporter` | 將 Scene3D JSON 提供 SketchUp Ruby extension 讀取並建立實體 | Node→Group、Face、Material、名稱 | 無 SketchUp 桌面程式時獨立輸出 SKP |
| `SkpSdkExporter` | 由 C/C++ SDK 讀取 Scene3D JSON、建立 SKP | 物件群組／元件、面、材質 | 未獲得 SDK 授權時可用 |

- Exporter 必須用 `capabilities` 宣告 `groups` / `materials` / `textures` / `native_skp` / `n_gon` 等功能。對無法保存的關鍵功能回傳錯誤或明確 warning，**不得聲稱 100% 無損**。
- 使用 C SDK 時，**僅在 exporter 末端將毫米轉成 SketchUp 內部英吋（`mm / 25.4`）**，輸入與兩份 IR 不得因此改成英吋。C SDK 調用需遵守官方主執行緒要求。
- DAE 不應將整個室內場景合併為單一網格；盡可能保留 node 階層及每面材質。SketchUp 匯入的實際群組結果仍需人工驗證。
- 材質貼圖使用相對路徑與明確資產清單；輸出時一併打包，不允許隱含依賴開發者機器的絕對路徑。

## 6. 相容性、版本與錯誤策略

### 6.1 版本控制

- `schema_version`: SemVer。**新增必要欄位、改座標定義、改開口偏移參照、改 mesh 世界座標語意** → major。
- 1.x 只能新增可選欄位或 namespaced `extensions`，不能刪除／改名既有欄位。
- 主版本不同時直接拒絕載入；如需遷移，實作明確 `v1_to_v2` migration。
- `FloorPlan2D` 與 `Scene3D` 禁止出現某個 Exporter 專屬的欄位，如 `ruby_entity` 或 `SUFaceRef`。

### 6.2 錯誤碼

| 錯誤碼 | 階段 | 對應行為 |
|---|---|---|
| `E_SCALE_UNVERIFIED` | Input / Transfer | 阻止正式 3D；要求校正圖面比例 |
| `E_WALL_ZERO_LENGTH` | Transfer | 阻止輸出，標示牆 ID |
| `E_OPENING_OUT_OF_BOUNDS` | Transfer | 阻止輸出，標示開口及牆 ID |
| `E_OPENING_OVERLAP` | Transfer | 阻止輸出，標示重疊開口 |
| `E_INVALID_POLYGON` | Transfer | 阻止輸出；須修正自交或無效多邊形 |
| `E_UNRESOLVED_ELEMENT` | Input / Review | 使用者確認前不得轉 3D |
| `E_UNSUPPORTED_OPTION` | Transfer / Export | 明示尚未實作的策略或 Exporter 能力 |
| `E_SCHEMA_VERSION` | 任一邊界 | 拒絕不相容版本 |
| `E_EXPORT_FAILED` | Export | 保留中介 JSON 與詳細錯誤，不銷毀前序成果 |

## 7. 專案目錄與交付成果

```text
web/
  js/app.js                  # UI 狀態與流程編排
  js/services/
    file-reader-service.js   # 讀檔
    extraction-service.js    # 萃取資料
    transfer-service.js      # 2D → 3D 幾何核心
    preview-service.js       # Scene3D 顯示，Three.js 僅存在於此
    export-service.js        # Scene3D → DAE ZIP；明示初稿與 validated 模式
  js/export/                 # COLLADA、標籤 PNG、ZIP 輔助，與 Preview 分離
  js/contracts/              # 共用預設值與預編譯 Schema validators
  js/geometry/               # 格式無關的網格與多邊形算法
  js/plan-analysis.js        # PDF 萃取輔助
  js/dxf-preview.js          # DXF 圖元展開與 2D canvas 繪製輔助
  assets/scene3d.example.json
  vendor/                    # PDF.js、dxf-parser、Three.js 與授權
scripts/serve.py              # 本機靜態伺服器
scripts/export-json-preview.mjs # 開發檢視用流程編排
schemas/                     # 四份 v1、兩份 v2 JSON Schema 與 migration 說明
examples/                    # v1 範例與數值預期
outputs/json-preview/        # 舊診斷 JSON 與規劃示例
outputs/model-preview/       # 目前圖面產生的候選牆初稿
tests/
```

## 8. 里程碑與驗收標準

| 里程碑 | 成果 | 客觀驗收 |
|---|---|---|
| M0 契約鎖定 | 4 份 JSON Schema、Golden fixtures | 所有 fixtures 通過 schema + 參照驗證 |
| M1 Transfer PoC | 一面 5,000mm 牆、150mm 厚、2,800mm 高、900mm 寬門洞、地板 | 生成幾何與開口位置正確，誤差 ≤ 1mm；有 source→node 對應 |
| M2 第一個 Exporter | DAE | Windows SketchUp 能匯入，牆／地板可分別選取與改材質；尺寸誤差 ≤ 1mm |
| M3 Adapter PoC | DXF → FloorPlan2D | 同一 fixture 可經手寫／DXF Adapter 產生等價 2D 語意 |
| M4 UI | 網頁圖面預覽＋人工校正 | 比例未確認、開口衝突會阻擋正式輸出 |
| M5 替換測試（選配） | Ruby 或 C++ exporter | **不修改 FloorPlan2D 與 Scene3D 契約**，仍能完成 M1/M2 核心驗收 |

**正式驗收還需在指定版本的 Windows SketchUp 上人工完成：** 開檔／匯入、檢查模型尺度、獨立選取牆體與地板、修改材質、編輯一個面／邊、另存 `.skp`、關閉後重新開啟。僅通過 JSON schema 或看得到 3D 預覽，不代表達成目標。

## 9. 已知實務限制與決策

- MVP 採**直線牆 + 矩形開口**；碰到不支援的曲線或異形必須報錯，不可把不明線條當作牆。
- `Scene3D` 是可交換的 **Geometry + Semantic** 結構；語意欄位有助於日後重新生成，但不是 SketchUp 的原生參數編輯器。
- `wall_join_policy=butt` 僅作 MVP 可用策略；真正多牆接合的重合面／縫隙需在後續實作 miter/union 並加入測試。
- 建議先開發 `FloorPlan2D → Scene3D → DAE`，再開發 DXF/PDF 的辨識，以便隔離圖面辨識錯誤與幾何錯誤。
- C SDK 是否可取得與授權條件須經官方確認；該風險不能進入核心 IR 設計。

## 10. 官方依據與參考

1. SketchUp C SDK：<https://developer.trimble.com/docs/sketchup/tools/sdk>
2. SketchUp C API：<https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html>
3. SketchUp COLLADA 匯入／匯出：<https://help.sketchup.com/en/sketchup/importing-and-exporting-collada-files>
4. SketchUp CAD 匯入／匯出：<https://help.sketchup.com/en/sketchup/importing-and-exporting-cad-files>
5. PyMuPDF 向量繪圖擷取：<https://pymupdf.readthedocs.io/en/latest/page.html>
6. ezdxf：<https://ezdxf.readthedocs.io/en/stable/>
7. GitHub Pages 靜態網站：<https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
8. Three.js 場景與瀏覽器渲染：<https://threejs.org/manual/pages/creating-a-scene.html>
9. OrbitControls：<https://threejs.org/docs/pages/OrbitControls.html>
10. Earcut：<https://github.com/mapbox/earcut/tree/v3.0.2>

**規範優先順序**：`schemas/*.json`（機器契約）→ 本文件的語意與流程規則 → `examples/*.json`（可執行範例）→ 各 exporter/adapter 的實作文件。如果互相矛盾，先修改規格及契約，並同步加入遷移與測試，不得以局部程式碼私自變更公開行為。
