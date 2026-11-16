# FloorPlan2D v2 / TransferReport v2

新增柱體與保留凹輪廓的牆，不能把柱子偽裝成 v1 的中心線牆，也不能把 L 型輪廓填成矩形。

- `FloorPlan2D@2.0.0`：每個 level 新增必要的 `columns` 陣列；`walls` 接受原本的中心線牆，或 `representation: "footprint"` 的多邊形牆。
- 多邊形牆與柱使用 `boundary_mm`、`holes_mm`、`height_mm`、`material_id`，保留 `id`、`confirmed`、`confidence`、`source_refs`。外環 CCW、洞環 CW，座標已為毫米。
- `TransferReport@2.0.0`：新增必要 `metrics.columns`；其餘語意維持 v1。v2 輸入產生 v2 report，v1 輸入仍產生 v1 report。
- `Scene3D@1.0.0`、`TransferProfile@1.0.0` 不變。柱／多邊形牆各自保留 group + mesh 與 source mapping；Preview、Exporter 消費相同 Scene3D。
- `migrateFloorPlanV1ToV2` 深複製已驗證的 v1，更新版本並補各層 `columns: []`。不更改 ID、座標、材料、門窗或確認狀態；升級前後的 Scene3D 應完全相同。
- 不提供無損 v2 → v1：舊版無法表示柱及凹牆。舊驗證器拒絕 v2，禁止降版本後靜默丟棄新物件。
- v2 中的中心線牆仍支援門窗；多邊形牆的水平開口目前明確拒絕，待後續定義定位規則。未知幾何、未分類物件、比例不明不可默默猜測。

驗收範例：一個 L 型水泥牆、一個矩形水泥柱、一個淺木色隔間；精確面積×高度體積、封閉網格、凹角不填滿、樓層高度、來源與材料、一一對應及 v1 相容性。
