# twothreeD

本機瀏覽器版圖面工作室。支援 PDF／DXF 主要圖面檢視，並把當前圖面的柱、隔間、門片與家具轉成可互動的 3D 初稿，再下載 單一 DAE 供 SketchUp 匯入編輯。

## 啟動

macOS 雙擊 `啟動圖面工作室.command`，或在專案目錄執行：

```sh
python3 scripts/serve.py
```

開啟 `http://127.0.0.1:8765/`（連接埠已使用時會自動選下一個）。請使用 HTTP 本機網址，不要直接雙擊 HTML。
Python 僅提供 `web/` 的靜態檔案；解析、轉換、3D 繪製與模型匯出都在瀏覽器，沒有上傳 API 或本機轉檔後端。

## 使用

1. 選擇或拖入一份 PDF／ASCII DXF，最大 50 MB。PDF 可換頁、旋轉；圖面可縮放／平移。
2. 預設只顯示主要平面圖，可切換完整原圖或手動框選 PDF。物件清單依相關圖層與文字標示整理，不把標示次數當實體數量。
3. 「辨識結構與家具」顯示填充結構輪廓、C/W/L/D/CH/CB/T/NC/E 編號及具名物件標記、顏色圖例與數量；可開關標記對照原圖。
4. 有斜線／網格填充的區域先依使用者規則標為水泥牆／柱候選；沒有填充的平行牆線先以淺木色顯示輕隔間候選。
5. 自動用來源圖面左上候選牆厚 20 cm 換算，牆高 250 cm、辦公屏風 120 cm、桌高 90 cm、門高 210 cm；不需輸入設定。
6. 按分頁旁的「產生 3D 預覽」，成功後 3D TAB 才會啟用並切換；可旋轉、平移、縮放、重設視角及下載 PNG。
7. 按「下載 DAE 編輯初稿」，取得單一 .dae 檔；沒有外部貼圖，不需解壓縮。
8. 換檔、移除、換頁或修改選區會清除舊結果，3D TAB 與下載按鈕重新停用。

實際 PDF 已辨識 **6 柱、3 水泥牆、5 輕隔間、2 扇門、18 椅、18 櫃、5 桌、12 個其他具名物件**，共 69 個物件。18 櫃與 10 台設備已套用外部或原創模型，其餘 2 個具名物件保留紅色方塊；目前共 **440 個零件網格**。右上兩扇門按圖面開啟方向顯示，門高 210 cm、深木色示意；左上「封門（不出入）」保留為待核對。
新增輕隔間是「新做 OA 辦公家具」旁的空心平行線，將相連細隔板保留為一組凹輪廓、淺木色顯示，桌面另以 90 cm 建模，座位凹角保持空白。含「辦公」標示且無填線的相連空心隔板視為 120 cm 屏風；填充證據優先排除。茶水間 L 型及短牆仍為水泥灰，其他牆柱保持 250 cm。
椅子保留原圖朝向，使用座面／椅背／四腳模板；帶 X 的大框作為雙門高櫃，左右兩排共 12 櫃。櫃門朝主區中心為顯示推定。桌子包含 4 組 L 形 OA 桌、1 組保留中央孔洞的橢圓會議桌。桌板厚 40 mm、桌腳款式是顯示預設。門框、過樑、窗、地板及其他未辨識家具尚未建模。JSON 僅供內部管線與開發測試，使用者畫面沒有 2D／3D JSON 下載入口。

## 使用者預設值

牆、門、椅與桌預設維護於 `web/js/contracts/model-defaults.js`；具名櫃體與紅色方塊維護於 `web/config/object-catalog.json`：

| 設定 | 值 |
|---|---|
| 比例參考牆 | 來源圖面最上排、最左側的候選牆 |
| 參考牆厚 | 200 mm（20 cm） |
| 牆高 | 2500 mm（250 cm） |
| 辦公區無填充屏風 | 1200 mm（120 cm） |
| 桌面頂部高度 | 900 mm（90 cm） |
| 門高 | 2100 mm（210 cm） |
| 椅座／椅背總高 | 450／850 mm（45／85 cm） |
| 高櫃高度 | 2100 mm（210 cm） |
| 具名櫃體：小／矮、其餘、高櫃／衣櫃 | 900／1500／2100 mm |
| 紅色方塊邊長／浮高 | 400／100 mm（示意尺寸） |
| 窗台高 | 900 mm（90 cm） |
| 窗高 | 1200 mm（120 cm） |

門高已套用至辨識出的門片；窗預設值保留待辨識後使用。手動旋轉顯示不會更換比例參考牆。PDF 紙張尺寸與 DXF 宣告單位不直接當成建築尺寸；目前優先使用指定參考牆的 20 cm 比例。尺寸預設已由使用者指定，但候選邊線仍待核對，故初稿 `scale_verified`／物件 `confirmed` 維持 false。

## 物件對應表與紅色方塊

`web/config/object-catalog.json` 集中保存 54 種物件、別名、場景分類、櫃高與模型對照，已接入 Extraction → Transfer → Preview。場景涵蓋居家、咖啡廳、飲料店、學校、共用空間及辦公室；分類只是字典整理，不會憑場景名稱放入未出現在圖面的設備。

櫃高依名稱為：小／矮 90 cm、高櫃／衣櫃 210 cm、其餘 150 cm；半高櫃與系統半高櫃歸其餘，小／矮規則優先。空框＋成對 X 的未標名構件仍為高櫃。已取得 46 個外部 GLB，另生成 6 個原創 GLB；43 類／41 個素材可依圖面尺寸配置，原 PDF 已套用 18 櫃體＋10 設備，未啟用款式保留模板／紅色方塊。

沒有可用模型的設備或新家具，以 40 cm 方塊在地面或承載檯面上浮 10 cm，六面不顯示文字，名稱保留在模型群組中；此尺寸不是實物大小。飲水機／烘碗機使用原創模型，放在茶水櫃頂；三台印表機已有承載櫃，跨櫃的一台保留待核對。電鍋 X2 依使用者要求直接忽略。一般白板與電子白板已採原創支架模型，依圖上完整尺寸 140×65×193 cm、130×85×176 cm 配置；剩餘海報機、雨傘架兩個紅色方塊。

**飲水機選款**：已辨識出桌／櫃承載關係時，選檯上款；沒有承載物時，選既有落地桶裝款。根據物件的 `support_id` 判斷，不單憑房間名稱或圖面上下位置。若承載尚未被辨識，可能選到落地款，仍需對照原圖。

**原創模型**：烘碗機、飲料杯封口機、煮茶機、檯上飲水機、一般白板與電子白板（含支架），皆為無品牌的 CC0 通用幾何。開啟 [設備模型庫](web/model-library.html)（本機網址 `/model-library.html`）可旋轉預覽並分別下載 GLB／單一 DAE。重建指令為 `node scripts/generate-model-assets.mjs`，生成不需要 AI API 或 Blender；來源與款式說明見 `web/assets/models/generated/SOURCES.txt`。完整模型包位於 `outputs/generated-models/twothreeD-original-appliances.zip`。

目前限向量 PDF 家具圖層的軸向封閉框及規律虛線；執行時沒有 AI、OCR 或完整房間語意辨識。物件保留獨立 group／mesh 與來源追溯，已可下載 DAE 初稿；SketchUp 實機選取／替換尚待驗收，詳見 SPEC §0.15–0.19。

## 自製模型配色

六款原創模型可設定外殼／板框顏色：在主畫面「3D 預覽 → 模型配色」，或設備模型庫的各模型卡片，使用選色器或輸入 `#RRGGBB` 後套用。同款模型共用顏色，可恢復原色；玻璃、金屬配件、按鈕及白板書寫面維持原樣。配色保存於同一網址的瀏覽器，模型庫與主圖同步；若瀏覽器拒絕儲存，介面會提示。

預覽與下載 DAE 使用相同配色。模型庫的「下載原始 GLB」保留原檔配色。設定在 `web/config/model-appearance.json`；`model-appearance-service.js` 專責配色、色碼與偏好，`model-color-controls.js` 專責 UI；尺寸、幾何與來源模型不變。新增素材可在設定中明確指定可改色零件，不會自動把所有材質染成同色。

## 匯入 SketchUp 2025 桌面版

1. 下載 `.dae` 檔，直接保留原檔即可，不需解壓縮。
2. SketchUp 選「檔案 → 匯入」，格式選 **COLLADA (*.dae)**，選擇下載的 `.dae`。
3. 保留「驗證 COLLADA 檔案」。可開啟「合併共平面」，減少同平面的三角形分割邊。
4. 使用縮放至全圖。若最外層為總群組，雙擊進入，再選取個別物件進行編輯、刪除或替換；編輯完另存 `.skp`。

匯入選項依 [SketchUp 官方 COLLADA 說明](https://help.sketchup.com/en/sketchup/importing-and-exporting-collada-files)。目前輸出 **COLLADA 1.4.1**，宣告毫米／Z 向上，保留 69 個物件群組與純色材質，沒有外部圖片。物件名稱、來源引用與授權存在 DAE metadata。可直接使用 `outputs/sketchup/twothreeD-editable-draft.dae`（約 3.6 MB）。

這是依圖面推估尺寸的**可編輯初稿**，不將比例／辨識改成已確認。缺少模型的物件是無字紅色立方體；面會三角化，沒有來源 PBR、動畫或 SketchUp 原生動態參數。已通過官方 XSD、幾何讀回與瀏覽器下載驗證；本機沒有 SketchUp，尚未完成 Windows SketchUp 2025 匯入、群組編輯與另存重開測試。

DAE 是目前的交換格式；沒有一個格式能保證所有 3D 軟體與版本都完整保留資料。之後可讓相同 Scene3D 分別輸出 GLB、OBJ 等格式；目前下載僅提供 單一 DAE，尚未產生原生 SKP。

## 服務分工

| 檔案（`web/js/services/`） | 職責 |
|---|---|
| `file-reader-service.js` | `readFile`：副檔名、驗證、PDF／DXF 解析、來源雜湊、`dispose` |
| `extraction-service.js` | `extractData`、主圖／物件摘要、`extractInspection`、`prepareWallCandidates`、`extractStructure`、`buildStructurePlan`；`buildWallPlan` 保留作 v1 相容 |
| `transfer-service.js` | `convert2DTo3D`：FloorPlan2D v1–v8 → Scene3D v1 + 對應版本 TransferReport；無來源格式、Three.js 或匯出格式依賴 |
| `preview-service.js` | `createScenePreview(container)`、`show(scene3d)`：顯示、互動與 PNG |
| `export-service.js` | `export3D`：Scene3D → 單一 DAE；`createExportLabelTextures`：標籤 PNG；`createJsonArtifact` 僅供開發檢視 |

`app.js` 編排操作和狀態。換輸入格式擴充 Reader／Extraction；換輸出副檔名擴充 Export；Preview 和 Export 都消費同一份 Scene3D。

另有獨立 `model-asset-service.js`：`loadModelAssets` 讀取素材表，`getModelAsset` 查本機模型 URL／作者引用，`getModelCredits` 產生去重引用清單。另由獨立 `model-geometry-service.js` 校驗並讀取 GLB，產生通用局部 Scene3D。Transfer 接收這份幾何，依物件自身外框計算尺寸、方向與承載高度，再交給 Preview。使用方式與 54 種對照見 [MODEL_SOURCES.md](MODEL_SOURCES.md)。

## 轉換核心與邊界

- 已建立四份 v1、兩份 v2、兩份 v3、兩份 v4、兩份 v5 、兩份 v6 、兩份 v7 及兩份 v8 JSON Schema；以 Ajv 預先編譯，瀏覽器只載入離線驗證程式。
- 核心支援直線牆、柱與凹多邊形牆、中心線牆的矩形門窗真實空洞、含洞地板、任意牆方向、樓層高度、群組、材質與來源追溯。
- 新增 `doors` 表達既有空隙中的門片；開啟及關閉位置都須通過牆柱碰撞檢查，不用門片遮住實牆。門與牆維持獨立群組、材質及來源對應。
- 正式 `strict` 模式要求有效比例、物件確認、合法幾何與參照。失敗時 `scene = null`，不以示例替代。
- 網頁使用 `preview` 模式呈現候選柱、隔間、門片與家具。初稿有 `extensions.twothreeD.preview_only = true`；Export 預設 `mode: 'validated'` 仍以 `E_PREVIEW_ONLY` 拒絕。網頁明示 `mode: 'draft'` 下載初稿，不更動確認狀態；無效幾何、參照或缺貼圖仍失敗。JSON 僅供內部處理與開發檢視。
- 純色材質、毫米、Z 向上，網格採世界座標。牆角目前使用 butt 分段接合，接縫／重疊面會提示；不支援 miter、曲線牆、來源 GLB 貼圖或任意符號的自動家具建模。方塊的文字 PNG 由 Export 獨立產生並打包。
- 單一 DAE 已可下載；Windows SketchUp 匯入、群組編輯與另存 SKP 尚未驗收。

## 專案結構

```text
web/index.html, styles.css      工作台
web/js/app.js                  UI 與流程編排
web/js/services/               五個管線服務及素材查詢／載入服務
web/config/model-assets.json   模型來源、授權、原始尺寸與對照
web/assets/models/             46 個 GLB、作者引用與授權
web/assets/models/generated/   另加 6 個原創 GLB 與來源聲明
web/model-library.html         原創設備與飲水機款式的互動預覽
web/js/contracts/              預設值、預編譯 Schema 驗證器
web/js/geometry/               3D 純幾何算法，不依賴 Three.js
web/js/export/                 DAE 序列化、標籤 PNG、ZIP 打包
web/js/extraction/             填充結構萃取的幾何輔助
web/js/plan-analysis.js        PDF 圖層／路徑萃取輔助
web/js/dxf-preview.js          DXF 圖元展開與 2D 繪製輔助
web/vendor/                    固定版本依賴與授權
schemas/                       v1–v8 JSON Schema 與升級說明
examples/                      契約範例及幾何預期
outputs/json-preview/          舊診斷 JSON 與獨立格式示例
outputs/model-preview/         從本次 PDF 產生的 2D／3D／Report 初稿
outputs/extraction/            牆柱輪廓證據（開發測試用）
outputs/structure-preview/     v6 柱與輪廓牆的 2D／3D／Report
outputs/asset-preview/         v8 圖框及標示尺寸、模型配置與來源引用
outputs/sketchup/              單一 DAE、已知尺寸 fixture 與匯出驗證產物
outputs/generated-models/      六款原創模型的 GLB／DAE／原始碼下載包
scripts/generate-model-assets.mjs 原創設備幾何與 GLB 產生器
scripts/serve.py               只提供 web/ 的本機伺服器
SPEC.md                        七階段清單與完成狀態
```

使用者原始 PDF 不放進 `web/`。網站每次從選取的檔案重新計算，不讀取 `outputs/`，也不再顯示固定 `scene3d.example.json`。
GitHub Pages 可提供這套靜態網站；3D 使用本機附帶的 Three.js／WebGL 2，無 CDN。裝置不支援 WebGL 2 時顯示錯誤。本次未部署網站。

## 開發驗證

```sh
node tests/check-tables.mjs
node tests/check-furniture.mjs
node tests/check-doors-office.mjs
node tests/check-transfer.mjs
python3 tests/validate_contracts.py /path/to/node
node tests/check-model-pipeline.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-structure-extraction.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-structure-transfer.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-services.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-plan-analysis.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-scene-preview.mjs
node tests/check-catalog.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-model-assets.mjs
node tests/check-generated-models.mjs
node tests/check-model-fitting.mjs <原始PDF> <含node_modules的依賴根目錄>
node tests/check-export.mjs <含node_modules的依賴根目錄>
python3 tests/check-dae.py
```

PDF 的 Node 測試需要 `@napi-rs/canvas`，網站不依賴它。`check-transfer` 更新 v1 幾何範例，`check-model-pipeline` 更新 v1 回歸產物；`check-structure-transfer` 更新 v2 範例及 v5 `outputs/structure-preview/`。`check-doors-office` 更新 v3 門片範例報告。`check-furniture` 更新 v4 範例報告。`check-tables` 更新 v5 桌面範例報告。`check-catalog` 更新 v6 範例及 `outputs/extraction/`、`outputs/structure-preview/`。v1 → v2 → v3 → v4 → v5 → v6 升級不改變舊模型幾何，說明見 `schemas/MIGRATION-v2.md`、`schemas/MIGRATION-v3.md`、`schemas/MIGRATION-v4.md`、`schemas/MIGRATION-v5.md`、`schemas/MIGRATION-v6.md`。
`check-model-colors` 檢查原創模型配色與 DAE；`check-boards` 更新 v8 白板範例與檢查完整標示尺寸，`check-model-fitting` 更新 v7 範例與 `outputs/asset-preview/`，確認模型等比尺寸、櫃體高度、承載與渲染。v6 → v7 的 migration 見 `schemas/MIGRATION-v7.md`，不帶 modelCatalog 的舊入口維持 v6。
`check-export` 使用其 Scene3D 產物，需開發用 `@napi-rs/canvas` 與 `jszip`，產生 `outputs/sketchup/`；`check-dae.py` 使用 Python 標準函式庫獨立讀回座標、面積、法線、階層與 ZIP。瀏覽器匯出不依賴上述 Node／Python 套件。官方 XSD 驗證及實機驗收狀態見 `tests/VERIFICATION.md`。
若修改 `schemas/`，以開發用 Ajv 8.17.1 執行 `node scripts/compile-contracts.mjs <含Ajv的依賴目錄>`，同步更新 `validators.generated.js` 再執行契約測試。

保留舊診斷 JSON 的重現工具：

```sh
node scripts/export-json-preview.mjs <PDF路徑> outputs/json-preview <含node_modules的依賴根目錄>
```

## 家具模型與交換格式

- 本次內建自產的參數化幾何，`web/js/geometry/furniture-templates.js` 提供 `builtin.chair.v1`、`builtin.tall_cabinet.v1` 與 `builtin.table.v1`；不需要下載外部資產，不依賴 Three.js 型別。
- `table-analysis.js` 從空白封閉家具框及平滑曲線辨識桌面，合併相鄰桌面、保留凹角與孔洞；已標明的設備／櫃體、填線及既有結構優先排除。`table-template.js` 生成桌板和位於實際輪廓內的獨立桌腳。
- Extraction 的 `furniture-analysis.js` 辨識 PDF 符號與 X 大框，Transfer 將尺寸與模板組成 Scene3D；Preview 顯示同一份模型。未來替換素材時只需先正規化到這份幾何契約。
- 已取得 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) 與 [3DAssets.dev](https://3dassets.dev/license) 各 23 個 CC0 GLB，約 1.8 MB；另生成 6 個原創 CC0 GLB，補上三個缺項及檯上飲水機。54 種物件皆有來源參考，尚有款式或貼圖限制者不自動使用。3DAssets.dev 的 23 個模型由來源標示 AI 協助製作，原創模型由程式幾何生成。兩款支架白板另依明確 W/D/H 標示配置。完整對照與復原方式見 [MODEL_SOURCES.md](MODEL_SOURCES.md)，作者引用見 [CREDITS.md](web/assets/models/CREDITS.md)。設備等比例縮進自身圖框，櫃體按框寬深及預設高度配置。
- 最新 SketchUp 官方文件支援 [GLB 匯入](https://help.sketchup.com/en/sketchup/working-gltf-files)，Three.js 提供 [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)；適用支援該格式的版本與方案。既定 DAE 路線亦有 [SketchUp COLLADA 匯入](https://help.sketchup.com/en/sketchup/importing-and-exporting-collada-files)及 [Three.js ColladaLoader](https://threejs.org/docs/pages/ColladaLoader.html)。來源核對：2026-11-15。
- 本次已完成 單一 DAE 下載並勾選 SPEC 第 7.1 項；Windows SketchUp 實機匯入／編輯維持第 7.2 項待驗收。GLB 輸出尚未實作。

## 第三方授權

PDF.js 5.4.149：Apache-2.0，`web/vendor/pdfjs/LICENSE`。
dxf-parser 1.1.2：MIT，`web/vendor/dxf-parser/LICENSE`。
Three.js 0.180.0：MIT，`web/vendor/three/LICENSE`。
Earcut 3.0.2：ISC，`web/vendor/earcut/LICENSE`。
Ajv 8.17.1 生成的驗證程式：MIT，`web/js/contracts/AJV-LICENSE.txt`。
外部模型：CC0-1.0，逐檔來源與引用見 `web/assets/models/CREDITS.md`；Kenney 原授權檔與 3DAssets.dev 來源聲明保存於 `web/assets/models/licenses/`。
