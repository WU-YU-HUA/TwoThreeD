# FloorPlan2D / TransferReport v7

v7 adds `model_object` to furniture. v1–v6 remain unchanged; migrating v6 to v7
only changes the version and preserves the existing scene. No placeholder is
silently reinterpreted as a measured model.

Extraction selects a catalog asset and retains the measured footprint, source
IDs, anchor, estimated rotation and same-level support. `uniform_footprint`
means scale = min(target width / native width, target depth / native depth).
All three equipment axes use that scale; height_mm must be null. Cabinets use
`cabinet_dimensions`, with independent measured width/depth and the user's
900/1500/2100 mm height. These dimensions are estimates from the calibrated
source drawing, not product specifications. No 0.9 multiplier is applied.

The separate model asset service loads curated local GLBs and produces local
Scene3D v1 geometry, millimetres / Z-up / centered XY / bottom at zero. It checks
the stored hash, expands default-scene transforms and quantized accessors,
preserves source material base colors, and rejects unsupported texture/skin/
morph/required extensions. Animations use the authored default pose; material
roughness/metalness and smooth source normals are not represented in Scene3D
v1, so this preview is a static, flat-shaded color approximation. Zero-area
source triangles are removed with a recorded count; invalid indices still fail.

Transfer takes `convert2DTo3D(plan, profile, modelScenes)`; `modelScenes` contains
portable Scene3D v1 values keyed by asset ID, never GLB or Three.js objects.
Scaling/rotation/placement are baked once into output world vertices. Equipment
rests on level base + support height (without the placeholder's 100 mm hover).
Cabinet hosts may themselves be model objects; missing/cyclic/invalid supports
fail. A footprint crossing the host edge or a hole is warned for review.

The model object footprint must be a non-holed rectangle matching its declared
anchor, rotation, width and depth. Imported meshes are triangle surfaces, not certified watertight construction
solids. Topology is validated for finite vertices, valid indices and nonzero
faces; structural extrusion retains its stronger closed-solid checks. Model
objects remain preview-only and strict mode refuses them until export review.
Each imported object has one editable group, source mapping, fit evidence and
author/license citation. Report v7 adds asset_models; cabinet counts retain their
meaning while equipment replacements leave the placeholders count.

Missing/variant/textured assets stay as clearly labeled placeholders or existing
cabinet templates. Failure to fetch or validate a selected asset fails conversion
instead of silently substituting geometry. Preview and future Export consume the
same resulting Scene3D v1; no renderer-only models are added.
