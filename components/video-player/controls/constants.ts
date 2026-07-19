export const CONTROLS_CONSTANTS = {
  TIMEOUT: 4000,
  DOUBLE_TAP_DELAY_MS: 250,
  SCRUB_INTERVAL_MS: 30 * 1000, // 30 seconds in ms
  SCRUB_INTERVAL_TICKS: 10 * 10000000, // 10 seconds in ticks
  TILE_WIDTH: 150,
  PROGRESS_UNIT_MS: 1000, // 1 second in ms
  PROGRESS_UNIT_TICKS: 10000000, // 1 second in ticks
  LONG_PRESS_INITIAL_SEEK: 30,
  LONG_PRESS_ACCELERATION: 1.2,
  LONG_PRESS_MAX_ACCELERATION: 4,
  LONG_PRESS_INTERVAL: 300,
  SLIDER_DEBOUNCE_MS: 3,
  HOLD_DRAG_ACTIVATE_MS: 500,
  // Touches starting this close to the left edge are left to the system
  // swipe-back gesture (active while controls are hidden).
  BACK_GESTURE_EDGE_EXCLUSION_PX: 30,
  HOLD_DRAG_DEAD_ZONE_PX: 10,
  HOLD_DRAG_MAX_DRAG_RATIO: 0.75, // Fraction of screen width for max seek distance
  HOLD_DRAG_MAX_SEEK_SECONDS: 600,
} as const;

export const ICON_SIZES = {
  HEADER: 24,
  CENTER: 50,
} as const;

export const HEADER_LAYOUT = {
  CONTAINER_PADDING: 8, // p-2 = 8px (matches HeaderControls)
} as const;
