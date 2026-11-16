---
name: floorplan-sketchup-pipeline
version: 1.11.0
description: >
  用於開發或修改「PDF/DXF/DWG → FloorPlan2D → Transfer → Scene3D → DAE/Ruby/SKP」
  的室內格局轉 3D 管線。當任務涉及輸入解析、2D 資料契約、2D 到 3D 幾何轉換、
  SketchUp 可編輯輸出或任一模組替換時套用。
---

# SKILL：維護可替換的 FloorPlan → SketchUp 管線

## 0. 目前實作階段

以 SPEC §0 的七項清單追蹤進度，實際完成並驗證後才勾選。現在採純靜態網頁；目前 UI 使用 FloorPlan2D／Report v7–v8（依圖框或白板完整尺寸配置模型），保留 v1–v7 相容與升級；Scene3D 維持 v1。preview 模式必須標示未確認，strict 與 Export 預設 validated 模式維持比例／確認阻擋。依使用者要求，已提供明示的「SketchUp 編輯初稿」單一 DAE 下載（Export `mode: 'draft'`）；不更改確認旗標，不冒充已核對模型。第 7.1 項下載已完成，SketchUp 2025 實機編輯／另存驗收仍為第 7.2 項待完成。第 1–3 項為原始檔案預覽，不是語意 Adapter；第 4–7 項仍須遵守下列資料契約與驗證。

## 1. 角色與優先目標

你是本專案的工程實作代理人。最重要的任務不是儘快輸出 `.skp`，而是**不讓任何來源格式、幾何函式庫或特定 SketchUp exporter 汙染跨模組資料契約**。

開始任何任務前，必須依序讀取：

1. `SPEC.md`（架構、物件語意、轉換規則與驗收）。
2. `schemas/floorplan2d.v1.schema.json`、`schemas/floorplan2d.v2.schema.json`、`schemas/floorplan2d.v3.schema.json`、`schemas/floorplan2d.v4.schema.json`、`schemas/floorplan2d.v5.schema.json`、`schemas/floorplan2d.v6.schema.json`、`schemas/floorplan2d.v7.schema.json`、`schemas/floorplan2d.v8.schema.json`、`schemas/scene3d.v1.schema.json`。
3. `schemas/transfer-profile.v1.schema.json`、`schemas/transfer-report.v1.schema.json`、`schemas/transfer-report.v2.schema.json`、`schemas/MIGRATION-v2.md`、`schemas/transfer-report.v3.schema.json`、`schemas/MIGRATION-v3.md`、`schemas/transfer-report.v4.schema.json`、`schemas/MIGRATION-v4.md`、`schemas/transfer-report.v5.schema.json`、`schemas/MIGRATION-v5.md`、`schemas/transfer-report.v6.schema.json`、`schemas/MIGRATION-v6.md`、`schemas/transfer-report.v7.schema.json`、`schemas/MIGRATION-v7.md`、`schemas/transfer-report.v8.schema.json`、`schemas/MIGRATION-v8.md`。
4. `examples/*.json` 與 `tests/validate_contracts.py`。

## 2. 不可破壞的規則（MUST）

1. **MUST** 使用已驗證的 `FloorPlan2D` 作為 InputAdapter 正式輸出；v2 支援柱與輪廓牆，v3 支援獨立門片，v4 支援椅子／高櫃模板，v5 支援含洞及凹輪廓桌面，v6 支援具名櫃體與含承載關係的六面標名方塊，v7 支援依圖框配置的外部模型，v8 加入明確設備尺寸與無字方塊，舊版保留相容。新能力不得偷塞進 v1 或偽裝物件類型。
2. **MUST** 使用 `Scene3D@1.0.0` + 對應輸入版本的 `TransferReport` 作為 TransferEngine 對外成果（v1 → Report v1，v2 → Report v2，v3 → Report v3，v4 → Report v4，v5 → Report v5，v6 → Report v6，v7 → Report v7，v8 → Report v8）。
3. **MUST** 以毫米儲存兩份 IR，2D X右／Y上、3D Z上／右手系；僅 Exporter 可轉成 SKP 內部英吋。
4. **MUST** 保留 2D ID、3D Node ID、`source_2d_ids` 與 `TransferReport.mapping` 的追溯關係。
5. **MUST** 將可手動修改、仍未確認的牆／開口、比例不明、幾何錯誤視為正式匯出的阻擋條件。使用者已要求的明示初稿下載可保留待核對辨識／尺寸，但不得放行無效幾何、未知比例矩陣、壞參照或缺少資產，也不得將 `confirmed`／`scale_verified` 改成 true。
6. **MUST** 經 JSON Schema 和自訂語意驗證；Schema 只能檢查形狀，不能替代幾何與交叉參照檢查。
7. **MUST** 依合約處理門窗開口為實際幾何空洞，不得用材質遮蔽或略過。
8. **MUST** 將每面牆、地板維持可辨識的群組／元件層級；不能在 exporter 中把全部空間合成單一不分物件的網格。
9. **MUST** 在不支援功能時回報錯誤／警告，不得默默假裝成功。
10. **MUST NOT** 把 `SUFaceRef`、Ruby SketchUp 實體、DAE XML、PyMuPDF draw command、DXF entity 等放入 FloorPlan2D 或 Scene3D。
11. **MUST NOT** 直接修改 JSON 契約來遷就某個 exporter；需要 breaking change 時建立新版本 schema 與 migration。
12. **MUST NOT** 假設 SketchUp 能匯入就等於容易編輯；必須在 Windows SketchUp 中實測。

## 3. 接到新任務時的執行流程

### A. 判斷模組邊界

- PDF/DXF/DWG 解析 → 只修改 `web/js/services/file-reader-service.js`、`extraction-service.js` 及其格式輔助與 FloorPlan2D 檢驗，不得修改 exporter。
- 牆體／開口／地板 2D→3D 算法 → 只修改 `web/js/services/transfer-service.js`、其幾何輔助、TransferProfile 和相關測試，不得修改 InputAdapter 或輸出器。
- DAE、Ruby、C SDK 匯出替換 → 只修改 `web/js/services/export-service.js` 及其輸出格式輔助；不得修改 FloorPlan2D / Scene3D 的既有公開欄位。
- 現有 Export 輔助位於 `web/js/export/`：DAE 序列化、標籤 PNG、ZIP 打包各自分離；不讀取 Preview 的 Three.js 物件。已知尺寸 fixture、官方 XSD、獨立 XML／ZIP 讀回與瀏覽器下載測試不能取代 SketchUp 實機編輯驗收。
- 3D 顯示 → 只修改 `web/js/services/preview-service.js`；只讀 Scene3D，不把 Three.js 型別放進 IR，不執行 Transfer 或 Export。
- GUI → 目前修改 `web/`；原始檔案顯示不冒充 IR，候選牆經 Extraction → Transfer → Preview，正式語意操作經 service API 呼叫功能，不導入 SDK 物件。
- 契約變更 → 先起草 schema migration、兼容性與 golden fixture，再實作。

- 模型來源與載入 → `model-asset-service.js` 管引用；`model-geometry-service.js` 把 GLB 轉為通用局部 Scene3D。尺寸／位置由 Transfer 的 `model-fitting.js` 處理，Preview 不載入額外模型。v7 設備使用自身框的等比容納尺寸；櫃體用框寬深與使用者高度。不得把素材原尺寸當成已確認實物尺寸。
- 缺少模型 → 本次 v8 新增 `builtin.marker_cube.v1`，六面無字、紅色、保留群組名稱／40 cm／浮高 10 cm。Preview 與 Export 依 `label_mode: none` 顯示純色；舊六面標籤模板仍可讀。網頁 Export `container: dae` 產生自包含單檔，若有外部圖片明確拒絕，舊 ZIP 路徑保留相容。
- 模型配色 → `model-appearance-service.js` 專責依 `model-appearance.json` 的明確零件範圍產生配色 Scene3D；每次從 baseScene 重建，禁止修改原 GLB／幾何。相同素材共用配色、保護非外殼材質、保留色碼及來源 metadata。Preview／Export 共同使用配色結果；原始 GLB 連結須明示。UI 編排在 `model-color-controls.js`，不得塞入 Preview Service。
- 支架白板 → 完整 W/D/H（含單位）須唯一配對，保留文字來源；v8 `equipment_dimensions` 採明確寬深高，v7 等比行為不改。缺失／歧義尺寸保留方塊。`migrateFloorPlanV7ToV8` 不改既有幾何。
- 原創設備 → 在 `scripts/generate-model-assets.mjs` 維護可重現的幾何，生成到 `web/assets/models/generated/`；以 generated 來源、版本、SHA-256、CC0 與本機來源檔標記，不偽裝外部下載。飲水機沿用 `support_id`：桌／櫃承載選 `placement_variants.on_support`，無承載選既有落地款，錯誤承載必須失敗。改模型需同步驗證圖框縮放、模型閉合／面向、單獨與整圖 DAE、來源引用及可見外觀；不變動兩份 IR。

### B. 先做範例，後寫實作

1. 確認需求在 `FloorPlan2D` 或 `Scene3D` 中有明確表達。
2. 優先建立小型 fixture，例如長 5m、厚 150mm、高 2.8m 的牆與一個 900mm 門洞。
3. 寫出預期數值／source-to-node mapping、幾何及材質結果。
4. 先編寫失敗案例（長度 0、開口超出牆、比例不明、材質缺失）。
5. 實作最小可驗證功能，不做多餘框架重構。
6. 執行 schema 測試、語意驗證、Transfer 幾何驗證、Exporter 測試。
7. 用 Windows SketchUp 實際匯入並確認群組與材質編輯。

### C. 輸出程式碼時的交付要求

每次提交／回覆都應包含：

- 修改了哪個邊界；為何不影響其他模組。
- 新增的檔案、函式和完整資料流程。
- 已執行測試與實際結果；沒有執行的測試必須明說。
- 若是 exporter，說明群組、貼圖、非三角面、尺寸、材質哪些會保存、哪些不保證。
- 若變動 schema，附上版本升級與 migration 策略。

## 4. 建議的最小抽象介面

```python
from pathlib import Path
from typing import Protocol

class InputAdapter(Protocol):
    def parse(self, path: Path, settings: dict) -> dict: ...
    # -> FloorPlan2D v1

class TransferEngine(Protocol):
    def transfer(self, plan: dict, profile: dict) -> tuple[dict, dict]: ...
    # -> (Scene3D v1, TransferReport v1)

class SceneExporter(Protocol):
    name: str
    def capabilities(self) -> dict: ...
    def export(self, scene: dict, dest: Path, options: dict) -> dict: ...
```

具體 Python 使用 Pydantic / dataclasses 皆可；C++ 使用 JSON parser 皆可，但**輸出 JSON 必須符合相同的 schema 與單位約定**。

## 5. 必須包含的驗證

### 5.1 FloorPlan2D validators

- `schema_version` 相容、`units == "mm"`、座標轉換矩陣有限值、`scale_verified`。
- 全域 ID 唯一，Wall 長度大於 0，厚／高合理且大於 0。
- Door/Window 指向存在且同樓層的牆、未超出範圍、同牆開口不重疊。
- 外邊界無自交、洞環位於外邊界內、輪廓方向正確。
- source_refs 及 `confidence` 保留，所有要輸出的物件 `confirmed`。

### 5.2 Transfer validators

- Wall 的 Z 上限等於基底 + 高度；厚度正確，方向隨 start→end 計算。
- 開口範圍是真空洞，沒有遮蔽面；門窗尺寸符合輸入。
- 3D node ID 與 parent refs 合法，無 parent cycle；mesh index 不越界，面非退化。
- 材質 ID 有效，至少生成可編輯的牆／地板群組。
- `TransferReport.mapping` 可從 2D ID 追到所有生成節點，且未遺失任何有幾何影響的物件。
- 嚴格模式下未知幾何、未確認尺寸、未支援策略應 fail，而非輸出假模型。

### 5.3 Exporter validators

- 輸出檔存在、大小合理、匯入 SketchUp 無錯誤。
- 5m 牆長、150mm 厚、2.8m 高的尺寸偏差不超過 1mm。
- 900mm 門洞保持正確且可見；至少牆與地板可分別選取、移動、換材質。
- 匯入後另存 `.skp` 再重開，模型仍有完整幾何。
- 若 exporter 不支援保留群組／材質貼圖，應明確回報，不得只給成功訊息。

## 6. 推薦開發次序

1. **Contract-first**：先確認 Schema、4 個 sample JSON、`validate_contracts.py` 全部通過。
2. **Transfer PoC**：先用手寫 `FloorPlan2D` 生成 `Scene3D`，不碰 CAD/PDF。
3. **DAE Exporter**：驗證可在 Windows SketchUp 手動匯入、編輯與另存 SKP。
4. **DXF Adapter**：讀取實際線條，形成語意化 FloorPlan2D。
5. **瀏覽器校正 GUI**：可檢查比例、手動修正辨識結果、預覽錯誤。
6. **Exporter 替換**：再做 Ruby bridge 或 C SDK；必須重用原有 Golden fixtures 與 Scene3D。
7. **PDF 語意 Adapter**：待前面的共同規格穩定後再加入；DWG 本機轉檔不在目前路線。

## 7. 代理人回覆格式

建議每次完成開發任務時，依此格式報告：

```text
目標：
本次影響邊界：Input / FloorPlan2D / Transfer / Scene3D / Exporter / GUI
契約異動：無 / 說明版本與 migration
實作：
測試：schema / semantics / geometry / SketchUp manual
尚未支援：
下一步：
```

## 8. 禁止的捷徑

- 直接把 CAD 線段外擠後稱作「房間」而不辨識牆、門與地板。
- 直接把 PDF 圖像貼上平面，再說可編輯。
- 直接輸出 STL 當作正式的可編輯室內模型格式。
- 為配合 DAE export 把多個牆體合併為一個 mesh。
- 以 `glTF → STL → SKP` 當作一定保留群組或材質的保證。
- 在任何中介資料中隱含單位、座標翻轉、比例猜測、外部材質絕對路徑。
- 未取得官方 C SDK 授權時，聲稱已可直接產生 `.skp`。

## 9. 完工定義（Definition of Done）

- [ ] 新／修改程式遵守正確模組邊界。
- [ ] Schema 檢驗及語意驗證通過。
- [ ] Golden fixtures／幾何數值測試通過。
- [ ] source ID → scene node mapping 完整且可查。
- [ ] 不依賴特定 exporter 的中介 IR 可獨立保存與重載。
- [ ] 選定的 exporter 能在 Windows SketchUp 匯入、獨立編輯與另存。
- [ ] 不支援功能與風險已文件化，沒有假裝成功。

**完成標準**：替換 `DaeExporter` 為 `RubyBridgeExporter` 或 `SkpSdkExporter`，前面的 `InputAdapter`、`FloorPlan2D` 與 `TransferEngine` 不需要修改；若替換 Transfer Engine，兩份 JSON 契約也不需要修改。
