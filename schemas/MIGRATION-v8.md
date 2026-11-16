# FloorPlan2D / TransferReport v8

v8 adds `equipment_dimensions` to `model_object.fit_mode`. It fits equipment to
explicit width, depth and height (all positive millimetres), independently along
the three axes. `height_mm` must be positive for this mode; `uniform_footprint`
still requires null height and scales all axes uniformly. Cabinet semantics do
not change. Known same-level support rules remain in force.

The first consumer is a pair of freestanding boards whose full W/D/H labels were
confirmed by the user. Extraction matches an unambiguous nearby complete label
including units, retains its source reference, and combines the board and stand
outline. Model selection uses the label dimensions in a centered rectangle,
retaining the calibrated source outline in metadata. Other equipment keeps the
previous footprint sizing policy. Missing or ambiguous board dimensions keep a
placeholder; no nearby unrelated number supplies dimensions implicitly.

v1–v7 schemas are unchanged. `migrateFloorPlanV7ToV8` only changes the version and
must produce identical Scene3D geometry, including with loaded model assets.
Selection upgrades a v7 result to v8 only when the new sizing mode is used.
Report v8 has the same metrics as v7. Scene3D remains v1 with baked world
coordinates, independent groups and source mapping. Source dimensions remain
reviewable estimates; the user approved this sizing policy, not every future
automatic association. Preview/validated export gates remain unchanged.

The same release adds `builtin.marker_cube.v1` for unlabelled placeholders.
It keeps the existing cube size, hover height, support and source name, while
omitting face labels. Scene3D marks its mesh with `label_mode: "none"`; the six
faces use the ordinary material. The application assigns a red material to
unavailable models. Older labelled-cube templates retain their six labels.
Both Preview and Export reject malformed or mixed representations. The normal
app can export a standalone DAE with names and source credits in metadata;
legacy labelled scenes still require a ZIP containing their PNG resources.
