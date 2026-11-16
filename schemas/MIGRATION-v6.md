# FloorPlan2D / TransferReport v6

v6 adds `cabinet` and `placeholder` to level furniture. v1–v5 are unchanged.
The cabinet pose follows v4 furniture: position, rotation, width, depth, height,
plus catalog type and height group. Height groups use the user's 900/2100/1500
mm defaults. `builtin.cabinet.v1` is the existing simplified cabinet geometry.

A placeholder is a symbolic cube, not a measured appliance. It preserves the
source footprint, position, original label, catalog type, quantity and an
optional `support_id`. Its size and hover offset are explicit millimetres.
Support must identify a same-level table/cabinet containing the equipment anchor;
source outlines that overhang their support are flagged for review. No missing, cyclic or unsupported support may silently fall back to the floor.
The cube bottom is level base + support height (or zero) + hover offset.

Scene3D remains v1. Each placeholder has an editable group and closed six-quad
mesh. A portable `semantic.face_labels` array on that mesh contains six
`{face_index, text}` records; indices reference actual mesh faces, not a renderer.
Preview renders those labels as per-face textures with outward-facing UVs.
Label metadata survives JSON round trips and is part of the source mapping;
a future exporter must implement it or explicitly reject unsupported labels.
No claim of SketchUp import/editing is made before exporter verification.

Report v6 adds `cabinets` (new catalog cabinet kind) and `placeholders` metrics.
Legacy `tall_cabinets` stays separate so old reports retain their meaning.
Migration v5 → v6 changes only the version and produces identical Scene3D.
Golden fixture includes a cabinet and a dispenser supported by its top.
