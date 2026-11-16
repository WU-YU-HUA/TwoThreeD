# 免費模型來源與引用

最後核對：2026-11-16。已定義 54 種物件；已下載 **46 個外部 GLB**，另製作 **6 個原創 GLB**，共 **2,311,628 bytes（約 2.3 MB）**。三個原缺項已有原創模型，54 種物件皆有來源參考；同一模型可對應多個通用類別，並不代表精確產品款式。43 類／41 個素材可依圖框配置；原 PDF 已實測 28 個物件套用模型。

## 已取得的來源

| 來源 | 本次保存 | 授權與引用 |
|---|---:|---|
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | 23 個 GLB | CC0-1.0；保留原包 License.txt。官方頁寫 1.0，而本次下載包的授權檔標示 Furniture Kit 2.0，因此以 archive SHA-256／檔案名稱固定版本，不猜版本號。 |
| [3DAssets.dev](https://3dassets.dev/license) | 23 個 GLB | 各模型頁及公開 API 標示 CC0-1.0；逐檔保存原作者、來源頁、不可變 CDN URL、SHA-256。這批 23 個模型均標示由 AI 協助製作，來源欄位保留作者聲明；網站本身不需串 AI。 |
| twothreeD 原創 | 6 個 GLB | CC0-1.0；無品牌的程式化幾何，保留產生程式、版本及 SHA-256，不標成第三方下載。 |

CC0 允許複製、修改與再散布，包含商業用途；模型作者引用雖非必要，本專案仍保留。依據：[Creative Commons CC0](https://creativecommons.org/publicdomain/zero/1.0/)。這是模型素材的授權，不代表整個來源網站的程式碼授權。

## 程式如何引用

- `web/config/object-catalog.json`：54 種物件辨識規則，`reference_asset_id` 連到素材；原有 `model_id` 保留舊版參數化模板。v7 會依素材表的逐類開關選擇可用模型。
- `web/config/model-assets.json`：每個模型的本機路徑、來源／下載 URL、作者、授權、引用文字、檔案雜湊、原始尺寸與款式註記。
- `web/assets/models/kenney/`、`web/assets/models/3dassets/`：已下載的模型；檔案均為自包含 GLB，無外部圖片或 buffer URI。
- `web/assets/models/generated/`：六個原創模型與 `SOURCES.txt`。產生程式在 `scripts/generate-model-assets.mjs`，使用專案附帶的 Three.js 基本幾何，產物不需任何外部 API。
- `web/assets/models/CREDITS.md`：可隨後續 3D 輸出一起提供的作者與素材引用清單。
- `web/js/services/model-asset-service.js`：獨立素材查詢與引用服務。
- `web/js/services/model-geometry-service.js`：獨立模型載入服務，讀 GLB 後輸出通用局部 Scene3D，供 Transfer 計算尺寸與放置。

```js
import {loadModelAssets, getModelAsset, getModelCredits}
  from './js/services/model-asset-service.js';

const library = await loadModelAssets();
const printer = getModelAsset(library, 'printer');
// printer.modelUrl：網站自身的 GLB URL，GitHub Pages 子路徑亦可用。
// printer.citation：作者、授權、來源網址。
// printer.mapping：類別吻合程度、款式註記與待處理事項。
const credits = getModelCredits(library, ['printer', 'photocopier']);
const countertop = getModelAsset(library, 'water_dispenser', {placement: 'on_support'});
```

已接入模型預覽與 DAE 初稿下載。逐類 `runtime_enabled = true` 的 43 類採 41 個素材（含飲水機兩種款式），其餘款式待核對與貼圖模型停用。Extraction 的 `applyModelSources` 產生 v7 模型物件；有明確白板尺寸時使用 v8 的 `equipment_dimensions`；`loadModelGeometry` 載入本機 GLB、驗證雜湊並輸出 mm／Z-up 的通用局部 Scene3D；Transfer 再烘焙尺寸與位置。Preview 和 Export 使用同一份最終 Scene3D；單一 DAE 的 `source_metadata` 包含本次使用的模型來源、授權與原始檔雜湊。

飲水機採 **有 `support_id` → `placement_variants.on_support` 檯上款；無承載 → 預設 `asset_id` 落地款**。桌面與櫃頂皆適用，壞承載參照由 Transfer 拒絕；若圖面未識別出承載，可能選到落地款。原圖飲水機已識別茶水櫃支撐，使用檯上款。

## 原創模型

六款原創模型的外殼／板框可在模型庫或主圖中選色；範圍由 `web/config/model-appearance.json` 指定。配色 Service 從原始 Scene3D 複製材質，保留玻璃、金屬配件、按鈕、白板書寫面與來源 GLB。配色後的 DAE metadata 保留所選 HEX 與原始授權／雜湊；GLB 下載仍為原始資產。

| 模型 | 原始外形範圍：寬×深×高（mm） | 造型內容 |
|---|---|---|
| 烘碗機 | 600×489.5×580 | 透明門、雙層架、碗盤、控制旋鈕、散熱口 |
| 飲料杯封口機 | 320×417×580 | 膜捲、封口壓頭、杯架與拉把、控制面板 |
| 煮茶機 | 430×446×626 | 濾茶槽、出茶容器、出茶嘴、接水盤、控制面板 |
| 檯上飲水機 | 332×350×530 | 冷熱雙出水口、內凹接水區、接水盤 |
| 一般白板（支架） | 1400×650×1930 | 白色板面、筆槽、支架與腳輪 |
| 電子白板（支架） | 1300×850×1760 | 板面、控制面板、筆槽、支架與腳輪 |

這些是原創通用示意，原始尺寸只決定外形比例，一般設備放入圖面按自身框線等比縮放；兩款白板依使用者確認的完整 W/D/H 標示配置。模型沒有產品商標、機械動作或產品級精度。六款共 507,580 bytes；作者標示 twothreeD，以程式助理協作撰寫生成程式，沒有引用第三方網格。

本機 `/model-library.html` 可互動預覽六款及既有落地飲水機，分別下載 GLB／DAE。`outputs/generated-models/twothreeD-original-appliances.zip` 包含六款 GLB、DAE、產生程式及來源說明；Windows SketchUp 實機編輯仍待驗收。

使用者確認設備採自身圖框：`s = min(框寬 / 模型寬, 框深 / 模型深)`，寬深高同乘 s；框與模型比例不同時留白，不乘 0.9。櫃體分別配合框寬、框深與已確認高度。設備底部落在地面或承載檯面；10 cm 浮高只用於缺項的無字紅色方塊。

原始 glTF 為公尺、Y-up；`inspection.dimensions_mm` 是讀取模型節點變換後量到的原生尺寸，**不是使用者確認的預設值**。例如櫃高仍以 90／150／210 cm 規則為準；模型保留開門動畫或吊架時也需選擇適合的靜態姿態。40 cm／上浮 10 cm 只適用目前的示意方塊。

## 54 種物件對照

「類別符合」只表示名稱與用途相符，不保證與圖面同款；「通用造型」需依用途調整；「款式待核對」有具體差異，不可直接自動替換。

| 物件 | 狀態 | 模型來源 | 備註 |
|---|---|---|---|
| 咖啡機 | 類別符合 | [kitchenCoffeeMachine](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 冰箱 | 類別符合 | [kitchenFridge](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 飲水機 | 依承載選款 | [落地桶裝款](https://3dassets.dev/assets/office-lobby-and-facilities-water-dispenser-f53b156e)＋原創檯上款 | 桌／櫃承載選原創檯上款，無承載選落地款。 |
| 白板 | 原創支架 | `twothreeD.generated.whiteboard` | 需可明確配對的完整 W/D/H 尺寸，否則保留方塊。 |
| 電子白板 | 原創支架 | `twothreeD.generated.electronic_whiteboard` | 優先匹配完整名稱；需完整 W/D/H 尺寸。 |
| 電視 | 類別符合 | [televisionModern](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 印表機 | 類別符合 | [Desktop printer (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-printer-desktop-a228d16a) | 類別符合；並非原圖物件的精確款式。 |
| 碎紙機 | 類別符合 | [Cross-cut shredder (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-shredder-cross-cut-2b7fd832) | 類別符合；並非原圖物件的精確款式。 |
| 影印機 | 類別符合 | [Multifunction printer (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-printer-multifunction-0b3b5d41) | 類別符合；並非原圖物件的精確款式。 |
| 烘碗機 | 原創通用造型 | twothreeD／CC0 | 雙層檯上烘碗機，已啟用；非精確產品規格。 |
| 洗碗機 | 款式待核對 | [Integrated dishwasher 600 (Home Appliances and Utility Room)](https://3dassets.dev/assets/home-appliances-and-utility-dishwasher-integrated-070297f1) | 嵌入式洗碗機，外觀需要搭配櫥櫃飾板。 |
| 衣櫃 | 類別符合 | [Wardrobe (Cozy Home Interiors)](https://3dassets.dev/assets/cozy-home-interiors-wardrobe-50e05964) | 類別符合；並非原圖物件的精確款式。 |
| 高櫃 | 通用造型 | [bookcaseClosedDoors](https://kenney.nl/assets/furniture-kit) | 封閉雙門收納櫃示意；不代表特定高櫃款式。 |
| 矮櫃 | 通用造型 | [cabinetTelevisionDoors](https://kenney.nl/assets/furniture-kit) | 低矮電視收納櫃，作為通用矮櫃備選。 |
| 書櫃 | 類別符合 | [bookcaseOpen](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 檔案櫃 | 類別符合 | [Filing cabinet, four drawer (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-filing-cabinet-4-drawer-e816dbb7) | 類別符合；並非原圖物件的精確款式。 |
| 系統櫃 | 通用造型 | [kitchenCabinet](https://kenney.nl/assets/furniture-kit) | 廚房下櫃模組，僅為系統櫃造型備選。 |
| 半高櫃 | 通用造型 | [Two-door office credenza (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-credenza-2-door-018b4a86) | 雙門辦公櫃，來源高度不取代已確認的 150 cm。 |
| 系統半高櫃 | 通用造型 | [Two-door office credenza (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-credenza-2-door-018b4a86) | 雙門辦公櫃，來源高度不取代已確認的 150 cm。 |
| 櫃子 | 通用造型 | [bookcaseClosedDoors](https://kenney.nl/assets/furniture-kit) | 通用封閉收納櫃；實際外形需核對。 |
| 沙發 | 類別符合 | [loungeSofa](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 床 | 類別符合 | [bedSingle](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 床頭櫃 | 類別符合 | [cabinetBed](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 洗衣機 | 類別符合 | [washer](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 乾衣機 | 類別符合 | [dryer](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 爐具 | 類別符合 | [kitchenStoveElectric](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 抽油煙機 | 類別符合 | [hoodModern](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 微波爐 | 類別符合 | [kitchenMicrowave](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 烤箱 | 款式待核對 | [Built-in steam oven 600 (Home Appliances and Utility Room)](https://3dassets.dev/assets/home-appliances-and-utility-oven-steam-built-in-c4a33f97) | 嵌入式蒸烤箱，非獨立桌上型烤箱。 |
| 吧台 | 類別符合 | [kitchenBar](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 吧台椅 | 類別符合 | [stoolBar](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 磨豆機 | 類別符合 | [On demand espresso grinder (Cafe, Bakery and Coffee Bar)](https://3dassets.dev/assets/bakery-and-cafe-grinder-on-demand-4bcd3bea) | 類別符合；並非原圖物件的精確款式。 |
| 製冰機 | 類別符合 | [Undercounter ice maker 400 (Home Appliances and Utility Room)](https://3dassets.dev/assets/home-appliances-and-utility-ice-maker-undercounter-8eec890c) | 類別符合；並非原圖物件的精確款式。 |
| 冷藏展示櫃 | 類別符合 | [Refrigerated cake display cabinet (Cafe, Bakery and Coffee Bar)](https://3dassets.dev/assets/bakery-and-cafe-cake-display-refrigerated-a04e6421) | 類別符合；並非原圖物件的精確款式。 |
| 工作台 | 款式待核對 | [Stainless prep table (Restaurant Kitchen and Dining Room)](https://3dassets.dev/assets/restaurant-kitchen-and-dining-prep-table-21e16598) | 餐飲用不鏽鋼工作台，不等同工業工作台。 |
| 水槽 | 款式待核對 | [kitchenSink](https://kenney.nl/assets/furniture-kit) | 含下櫃的廚房水槽組；與既有承載櫃一起使用時須避免重複櫃體。 |
| 封口機 | 原創通用造型 | twothreeD／CC0 | 杯用封膜機，含膜捲及杯架，已啟用。 |
| 果汁機／調理機 | 類別符合 | [kitchenBlender](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 煮茶機 | 原創通用造型 | twothreeD／CC0 | 茶用萃煮設備示意，含濾茶槽與出茶容器，已啟用。 |
| 開水機 | 類別符合 | [Counter water boiler (Cafe, Bakery and Coffee Bar)](https://3dassets.dev/assets/bakery-and-cafe-water-boiler-e3688ca1) | 類別符合；並非原圖物件的精確款式。 |
| 備料台 | 類別符合 | [Stainless prep table (Restaurant Kitchen and Dining Room)](https://3dassets.dev/assets/restaurant-kitchen-and-dining-prep-table-21e16598) | 類別符合；並非原圖物件的精確款式。 |
| 課桌 | 類別符合 | [Student Desk (Japanese School and City Street)](https://3dassets.dev/assets/japanese-school-and-city-street-student-desk-9e5d008a) | 類別符合；並非原圖物件的精確款式。 |
| 講桌 | 款式待核對 | [Lectern (Japanese School and City Street)](https://3dassets.dev/assets/japanese-school-and-city-street-lectern-f8b909de) | 斜面站立講台，若圖面為教師桌需另選平面桌款。 |
| 黑板 | 類別符合 | [Blackboard with Chalk Tray (Japanese School and City Street)](https://3dassets.dev/assets/japanese-school-and-city-street-blackboard-with-chalk--fc405c1d) | 類別符合；並非原圖物件的精確款式。 |
| 投影機 | 款式待核對 | [Ceiling-mount projector (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-projector-ceiling-mount-73d3f7cc) | 含天花吊架；放在桌上時須選無吊架版本。 |
| 投影幕 | 類別符合 | [Tripod projection screen (Hotel and Resort Operations)](https://3dassets.dev/assets/hotel-and-resort-operations-projection-screen-2d55dd6b) | 類別符合；並非原圖物件的精確款式。 |
| 置物櫃 | 款式待核對 | [Locker bank, six door (Downtown Office Interiors)](https://3dassets.dev/assets/downtown-office-interiors-locker-bank-6-9938ad56) | 六門置物櫃組，需核對圖面是一組或單格櫃。 |
| 書架 | 類別符合 | [bookcaseOpen](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 實驗台 | 款式待核對 | [Teaching Lab Bench with Sink and Service Spine (University Lecture Hall and Campus)](https://3dassets.dev/assets/university-lecture-hall-and-campus-lab-bench-with-sink-ffde2f63) | 含水槽、層架與服務管線的實驗桌，非單純空桌。 |
| 洗手台 | 款式待核對 | [bathroomSink](https://kenney.nl/assets/furniture-kit) | 洗手台組，安裝方式及與櫃體重疊需核對。 |
| 馬桶 | 類別符合 | [toilet](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 淋浴設備 | 類別符合 | [shower](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 垃圾桶 | 類別符合 | [trashcan](https://kenney.nl/assets/furniture-kit) | 類別符合；並非原圖物件的精確款式。 |
| 清潔用具櫃 | 類別符合 | [Cleaning Locker (Japanese School and City Street)](https://3dassets.dev/assets/japanese-school-and-city-street-cleaning-locker-66eb1ddc) | 類別符合；並非原圖物件的精確款式。 |

## 原外部素材缺項與排除理由（現由原創模型補齊）

- **烘碗機**：找到的 [CGTrader 範例](https://www.cgtrader.com/free-3d-models/interior/kitchen/dish-dryer-c1ef924b-651d-443e-bf79-4c0b8af9446c) 標示 Royalty Free License，尚未確認適合本專案公開素材庫再散布，沒有下載或列為開放授權模型；瀝水架與實驗室乾燥櫃也不相符。
- **飲料杯封口機**：搜尋到的袋口封口機、杯子與封膜示意不等於封口機，沒有冒用。
- **煮茶機**：咖啡沖煮機、熱水桶、整組茶水桌或工業製茶機不等同飲料店煮茶機，保留缺項。
- **檯上飲水機款式**：已有落地桶裝模型，另外製作檯上模型，現在由承載關係自動選擇；不把落地款縮小後放上桌。
- **電鍋 X2**：依使用者要求忽略，不在本次採購／模型生成清單。

另已取得作者發佈的 [Quaternius Ultimate House Interior](https://quaternius.com/packs/ultimatehomeinterior.html) CC0 原包作備選；下載自 [作者的 OpenGameArt 頁](https://opengameart.org/content/lowpoly-house-interior-pack)。原包主要為 OBJ／FBX／Blend，本次優先使用可直接引用的 GLB，未將這包混進公開素材目錄；原包保留在 `.local/asset-research/quaternius-interior.zip`。

## 重現與驗證

```sh
# 補回缺失的 3DAssets.dev 檔案；現有檔案必須符合已保存 SHA-256。
python3 scripts/fetch-model-assets.py
# 解碼位置、節點變換與原始尺寸，不需要本機轉檔程式。
node scripts/inspect-model-assets.mjs
node tests/check-model-assets.mjs
node scripts/generate-model-assets.mjs
node tests/check-generated-models.mjs
node tests/check-model-fitting.mjs <原始PDF> <含node_modules的依賴根目錄>
```

Kenney 需從官方頁按 Download → Continue without donating 取得原包；網站使用短效下載連結，不能將過期連結硬寫在網站。將包內 `Models/GLTF format/` 中 manifest 的 `archive_member` 放至對應 `local_uri`，再執行檢查。本次原包 SHA-256：`e67652d0932cee41683f74711c03d3e192a2af9979ef8e6b237711f5482d46b0`。

已驗證 52 個來源檔的結構、雜湊、幾何與尺寸；41 個素材可轉成共用幾何。原 PDF 已實測 18 櫃＋10 設備套用模型、2 個方塊保留，合計 440 網格／510 節點。六款原創模型外觀與下載已實測；全部原圖及單獨 DAE 通過 XSD。尚未逐件驗收整個外部素材庫，也未執行 Windows SketchUp 匯入。

目前保留材質基礎色及靜態預設姿態，使用平面法線；來源平滑法線、金屬度／粗糙度及動畫尚未保留。移除 34 個來源中共 116 個零面積三角形並記錄；錯誤索引不略過。貼圖／蒙皮／變形來源明確拒絕。依據 [glTF 2 規格](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)及 [KHR_mesh_quantization](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md)。外部表面網格由 preview 生成，strict 仍拒絕；已可明示下載 DAE 編輯初稿，SketchUp 實機匯入／編輯仍待驗收。
