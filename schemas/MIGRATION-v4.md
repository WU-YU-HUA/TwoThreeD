# FloorPlan2D v4 / TransferReport v4

v4 增加 level 必要的 `furniture` 陣列。家具使用獨立語意與可替換模板，不能偽裝為牆、柱或直接把 PDF 曲線塞進 Scene3D。

- 家具共同欄位：`id`、確認／信心／來源欄位、`kind`、`template_id`、`position_mm`（平面中心）、`rotation_deg`（由局部 X/Y 逆時針轉到來源世界座標）、`width_mm`、`depth_mm`、`height_mm`、`material_id`、`accent_material_id`。局部 +Y 為正面，底部在樓層基底。
- `chair` 使用 `builtin.chair.v1`，另有必要 `seat_height_mm`，須低於總高；首版包含座面、椅背、四支椅腳。高度使用者指定為座面 450 mm／總高 850 mm。
- `tall_cabinet` 使用 `builtin.tall_cabinet.v1`，首版包含側板、頂底、背板、雙門與把手；使用者指定高 2100 mm。櫃體正面朝主區中心的方向只是顯示推定，保留待核對狀態。
- 寬深與位置已為毫米，Transfer 不再次套用來源比例；模板只產生通用頂點、面及材質 ID，不依賴 Three.js、PDF、GLB、SketchUp 或匯出格式。未知模板必須失敗。
- 每個家具保留一個 group 與獨立零件 mesh，所有零件維持來源 mapping。`Scene3D@1.0.0` 不變，可由 Preview 顯示，未來由 Export 產生 DAE；本次不聲稱完成正式 DAE 或 SketchUp 實機驗收。
- `TransferReport@4.0.0` 新增必要 `metrics.chairs`、`metrics.tall_cabinets`；不混進牆柱數量。
- `migrateFloorPlanV3ToV4` 驗證、深複製、更新版本並補 `furniture: []`，不變更舊模型幾何。v1／v2／v3 舊 Schema 與入口維持相容，不提供有家具資料的無損降版。

Golden fixture：旋轉椅子與高櫃，驗證精確高度、平面尺寸、正面方向、封閉零件、材質、來源與群組；負例包含零尺寸、座高超過總高、未知模板、錯誤材質及重複 ID。

2026-11-17 模板擴充：`chair.template_id` 另支援 `builtin.office_chair.v1`，新增雙扶手、五腳底座及腳輪，沿用相同寬深、座高、總高、朝向及材質欄位。這是模板登錄的新增值，Schema 本來即接受字串，無須遷移；舊 `builtin.chair.v1` 幾何不變，未知模板仍拒絕。舊版程式未登錄新模板時不能顯示新款。測試見 `tests/check-office-chairs.mjs`；兩款皆由共用 Scene3D 管線預覽及輸出 DAE。
