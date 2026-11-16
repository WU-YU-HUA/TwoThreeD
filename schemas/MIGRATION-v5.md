# FloorPlan2D / TransferReport v5

v1–v4 schemas remain unchanged. v5 adds `kind: table` to level furniture;
chairs and cabinets retain their v4 fields. Scene3D and TransferProfile stay v1.

Tables carry world-XY `boundary_mm` (CCW), `holes_mm` (CW), `height_mm`
(floor to tabletop top), `top_thickness_mm`, body/accent materials, template ID,
review state and source references. Unlike positioned rectangular chair/cabinet
templates, table outlines already contain their position and orientation.
This preserves L-shaped desktops and the conference table's central opening.

`builtin.table.v1` builds a tabletop and separate supports within its filled
footprint. Height is the user's 900 mm default; 40 mm top thickness and support
style are display assumptions, not measurements. Every part is an editable mesh
under the source table's group, with complete source-to-node mapping.

Report v5 adds required `metrics.tables`. Migration v4 → v5 deep-clones the plan
and changes only its version; old plans produce identical Scene3D geometry.
No down-migration is offered for tables. Unknown templates, invalid holes,
top thickness >= height or unsupported support geometry fail explicitly.

Golden fixture: `examples/floorplan2d.v5.sample.json`, including a concave
L tabletop and a table with a hole. Real PDF evidence remains unconfirmed and
preview-only; this does not complete formal export or SketchUp import validation.
