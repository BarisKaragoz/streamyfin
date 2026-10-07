export const CONTROLS_CONSTANTS = {
  TIMEOUT: 4000,
  DOUBLE_TAP_DELAY_MS: 250,
  // Media time left when the next episode button appears. The countdown fill
  // spans the same window, so both must move together.
  NEXT_EPISODE_COUNTDOWN_MS: 10000,
  SCRUB_INTERVAL_MS: 30 * 1000, // 30 seconds in ms
  SCRUB_INTERVAL_TICKS: 10 * 10000000, // 10 seconds in ticks
  TILE_WIDTH: 150,
  PROGRESS_UNIT_MS: 1000, // 1 second in ms
  PROGRESS_UNIT_TICKS: 10000000, // 1 second in ticks
  LONG_PRESS_INITIAL_SEEK: 30,
  LONG_PRESS_ACCELERATION: 1.2,
  LONG_PRESS_MAX_ACCELERATION: 4,
  LONG_PRESS_INTERVAL: 300,
  // How long a still touch must be held before it engages. One hold drives
  // both the speed boost and, once the finger moves sideways, the drag seek.
  HOLD_SPEED_DELAY: 500,
  HOLD_SPEED_DIM_OPACITY: 0.2,
  HOLD_SPEED_DIM_DURATION: 300,
  CONTROLS_SCRIM_OPACITY: 0.75,
  SLIDER_DEBOUNCE_MS: 3,
  // Progress ticks arrive at most once per second, so the last one before EOF
  // can land anywhere inside the final second — 1.5s guarantees it's caught.
  STILL_WATCHING_EOF_WINDOW_MS: 1500,
  // Touches starting this close to the left edge are left to the system
  // swipe-back gesture (active while controls are hidden). Must match the
  // player route's gestureResponseDistance.end in app/_layout.tsx.
  BACK_GESTURE_EDGE_EXCLUSION_PX: 50,
  // Sideways travel during a hold that switches it from speed boost to seek,
  // and the dead zone before the seek offset starts growing
  HOLD_DRAG_DEAD_ZONE_PX: 10,
  HOLD_DRAG_MAX_DRAG_RATIO: 0.75, // Fraction of screen width for max seek distance
  HOLD_DRAG_MAX_SEEK_SECONDS: 600,
  // Live-seek scrub preview (used when the item has no trickplay images):
  // while hold-dragging, the paused video is seeked to the scrub position so
  // the full-screen frame acts as the preview. Throttled to avoid hammering
  // the demuxer/network with a seek per touch event.
  HOLD_DRAG_LIVE_SEEK_INTERVAL_MS: 300,
  HOLD_DRAG_LIVE_SEEK_MIN_DELTA_MS: 500,
} as const;

export const ICON_SIZES = {
  HEADER: 24,
  CENTER: 50,
} as const;

export const HEADER_LAYOUT = {
  CONTAINER_PADDING: 8, // p-2 = 8px (matches HeaderControls)
} as const;
