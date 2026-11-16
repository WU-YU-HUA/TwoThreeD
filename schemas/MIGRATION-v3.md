# FloorPlan2D v3 / TransferReport v3

門片是獨立物件，不能偽裝為牆或柱。v3 新增 level 必要的 `doors` 陣列；保留 v1/v2 原有牆、柱、開口語意。

- `door`：`kind: "hinged"`、`placement: "existing_gap"`、`boundary_mm`（門片在圖面開啟位置的 CCW 輪廓）、`hinge_mm`、`closed_end_mm`（關閉時的門片末端）、`height_mm`、`material_id`，以及共同的 ID／確認／來源欄位。門片底部位於樓層基底，門高預設 2100 mm。
- `existing_gap` 僅適用於已存在空隙的獨立門片，不表示已辨識完整門洞、門框或上方過樑。Transfer 檢查開啟與關閉位置均不與牆柱實體重疊；若有重疊則拒絕，不能用門片遮蔽實牆。需在牆內挖洞的情況仍使用原本 `openings` 契約；輪廓牆切洞尚未支援。
- 轉換為獨立 door group + door_leaf mesh，保留 hinge、closed_end、height 及 source mapping。Preview 繼續只讀 `Scene3D@1.0.0`；不新增 renderer 專用欄位。
- `TransferReport@3.0.0` 新增必要 `metrics.doors`，數量為門片，不混入 `metrics.openings`。
- `migrateFloorPlanV2ToV3` 驗證並深複製 v2，更新版本、補 `doors: []`。v1 可先升 v2 再升 v3；升級前後的 Scene3D 完全相同。不提供有門片資料的無損降版。
- 舊 Schema 不變，舊版驗證器拒絕 v3。使用獨立新版本避免舊程式靜默遺失門片。

Golden fixture：獨立 900×40×2100 mm 的開啟門片、無碰撞空隙、獨立群組／材質／來源，負例包含無效軸點、與牆柱碰撞、未確認、缺材質及高度錯誤。
