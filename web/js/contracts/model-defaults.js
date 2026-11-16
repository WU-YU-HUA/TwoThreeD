// User-provided modeling defaults, confirmed in this project on 2026-11-15.
// Boundary pairing still needs review; a default dimension is not a recognized object.
export const MODEL_DEFAULTS = Object.freeze({
  reference_wall_rule: 'upper_left',
  reference_wall_thickness_mm: 200,
  wall_height_mm: 2500,
  office_screen_height_mm: 1200,
  door_height_mm: 2100,
  window_sill_height_mm: 900,
  window_height_mm: 1200,
  chair_seat_height_mm: 450,
  chair_height_mm: 850,
  tall_cabinet_height_mm: 2100,
  table_height_mm: 900,
  table_top_thickness_mm: 40, // Display assumption; not measured from the plan.
  missing_model_color_rgba: Object.freeze([.85,.16,.12,1]),
});
