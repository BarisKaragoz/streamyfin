import { useCallback, useEffect, useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import { CONTROLS_CONSTANTS } from "../constants";

export interface SwipeGestureOptions {
  minDistance?: number;
  maxDuration?: number;
  doubleTapDelay?: number;
  longPressDuration?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onVerticalDragStart?: (side: "left" | "right", initialY: number) => void;
  onVerticalDragMove?: (
    side: "left" | "right",
    deltaY: number,
    currentY: number,
  ) => void;
  onVerticalDragEnd?: (side: "left" | "right") => void;
  onTap?: () => void;
  onDoubleTapLeft?: () => void;
  onDoubleTapRight?: () => void;
  /** Ignore touches starting within this many px of the left edge (0 = off).
   * Used to leave room for the system swipe-back gesture. */
  leftEdgeExclusionPx?: number;
  onLongPressStart?: () => void;
  /** Fires when the hold is released, or when it hands over to a hold-drag seek */
  onLongPressEnd?: () => void;
  /** Sliding sideways during a hold seeks. Without onLongPressStart there is
   * nothing else for the hold to do, so it starts seeking straight away. */
  holdDragEnabled?: boolean;
  onHoldDragStart?: () => void;
  onHoldDragMove?: (deltaX: number) => void;
  onHoldDragEnd?: (deltaX: number) => void;
  screenWidth?: number;
  screenHeight?: number;
}

export const useGestureDetection = ({
  minDistance = 50,
  maxDuration = 800,
  doubleTapDelay = CONTROLS_CONSTANTS.DOUBLE_TAP_DELAY_MS,
  longPressDuration = 500,
  onSwipeLeft,
  onSwipeRight,
  onVerticalDragStart,
  onVerticalDragMove,
  onVerticalDragEnd,
  onTap,
  onDoubleTapLeft,
  onDoubleTapRight,
  leftEdgeExclusionPx = 0,
  onLongPressStart,
  onLongPressEnd,
  holdDragEnabled = false,
  onHoldDragStart,
  onHoldDragMove,
  onHoldDragEnd,
  screenWidth = 400,
  screenHeight = 800,
}: SwipeGestureOptions = {}) => {
  const touchStartTime = useRef(0);
  const touchStartPosition = useRef({ x: 0, y: 0 });
  const lastTouchPosition = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragSide = useRef<"left" | "right" | null>(null);
  const hasMovedEnough = useRef(false);
  const gestureType = useRef<"none" | "horizontal" | "vertical" | "holdDrag">(
    "none",
  );
  const shouldIgnoreTouch = useRef(false);
  const lastTapTime = useRef(0);
  const lastTapSide = useRef<"left" | "right" | null>(null);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const longPressTimeout = useRef<number | null>(null);
  const isLongPressing = useRef(false);

  const clearSingleTapTimeout = useCallback(() => {
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
  }, []);

  const cancelLongPressTimer = useCallback(() => {
    if (longPressTimeout.current !== null) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
  }, []);

  const resetTapState = useCallback(() => {
    lastTapTime.current = 0;
    lastTapSide.current = null;
  }, []);

  // Clear any pending timers on unmount
  useEffect(() => {
    return () => {
      clearSingleTapTimeout();
      cancelLongPressTimer();
    };
  }, [clearSingleTapTimeout, cancelLongPressTimer]);

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      // A held long press owns the gesture, so ignore extra touches
      if (isLongPressing.current) {
        return;
      }

      const startY = event.nativeEvent.pageY;
      const startX = event.nativeEvent.pageX;

      // Define exclusion zones (15% from top and bottom)
      const topExclusionZone = screenHeight * 0.15;
      const bottomExclusionZone = screenHeight * 0.85;

      // Check if touch started in exclusion zones. The left-edge strip is
      // reserved for the system swipe-back gesture when enabled.
      if (
        startY < topExclusionZone ||
        startY > bottomExclusionZone ||
        (leftEdgeExclusionPx > 0 && startX < leftEdgeExclusionPx)
      ) {
        shouldIgnoreTouch.current = true;
        return;
      }

      shouldIgnoreTouch.current = false;
      touchStartTime.current = Date.now();
      touchStartPosition.current = {
        x: event.nativeEvent.pageX,
        y: startY,
      };
      lastTouchPosition.current = {
        x: event.nativeEvent.pageX,
        y: startY,
      };
      isDragging.current = false;
      dragSide.current = null;
      hasMovedEnough.current = false;
      gestureType.current = "none";

      cancelLongPressTimer();
      isLongPressing.current = false;
      if (onLongPressStart || holdDragEnabled) {
        longPressTimeout.current = setTimeout(() => {
          longPressTimeout.current = null;
          // Only engage if no other gesture has claimed this touch
          if (gestureType.current !== "none") return;
          clearSingleTapTimeout();
          resetTapState();
          isLongPressing.current = true;
          if (onLongPressStart) {
            onLongPressStart();
          } else {
            gestureType.current = "holdDrag";
            onHoldDragStart?.();
          }
        }, longPressDuration) as unknown as number;
      }
    },
    [
      screenHeight,
      leftEdgeExclusionPx,
      cancelLongPressTimer,
      clearSingleTapTimeout,
      resetTapState,
      longPressDuration,
      onLongPressStart,
      holdDragEnabled,
      onHoldDragStart,
    ],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        return;
      }

      const currentPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      const deltaX = currentPosition.x - touchStartPosition.current.x;
      const deltaY = currentPosition.y - touchStartPosition.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // A held press ignores movement, except that sliding sideways hands it
      // over to a hold-drag seek, which then takes all horizontal movement
      if (isLongPressing.current) {
        if (gestureType.current !== "holdDrag") {
          if (
            !holdDragEnabled ||
            absX <= CONTROLS_CONSTANTS.HOLD_DRAG_DEAD_ZONE_PX
          ) {
            return;
          }
          onLongPressEnd?.();
          gestureType.current = "holdDrag";
          onHoldDragStart?.();
        }
        onHoldDragMove?.(deltaX);
        lastTouchPosition.current = currentPosition;
        return;
      }

      // Lower threshold for starting gestures - make it more sensitive
      if (!hasMovedEnough.current && totalDistance > 8) {
        hasMovedEnough.current = true;
        // Movement means this is a swipe or drag, not a long press
        cancelLongPressTimer();

        // Determine gesture type based on initial movement direction
        if (absY > absX && absY > 5) {
          // Vertical gesture - start drag immediately
          clearSingleTapTimeout();
          resetTapState();
          gestureType.current = "vertical";
          const side =
            touchStartPosition.current.x < screenWidth / 2 ? "left" : "right";
          isDragging.current = true;
          dragSide.current = side;
          onVerticalDragStart?.(side, touchStartPosition.current.y);
        } else if (absX > absY && absX > 10) {
          // Horizontal gesture - mark for discrete swipe
          clearSingleTapTimeout();
          resetTapState();
          gestureType.current = "horizontal";
        }
      }

      // Continue vertical drag if already dragging
      if (
        isDragging.current &&
        dragSide.current &&
        gestureType.current === "vertical"
      ) {
        const deltaFromStart = currentPosition.y - touchStartPosition.current.y;
        onVerticalDragMove?.(
          dragSide.current,
          deltaFromStart,
          currentPosition.y,
        );
      }

      lastTouchPosition.current = currentPosition;
    },
    [
      holdDragEnabled,
      onLongPressEnd,
      onHoldDragStart,
      onHoldDragMove,
      onVerticalDragStart,
      onVerticalDragMove,
      screenWidth,
      cancelLongPressTimer,
      clearSingleTapTimeout,
      resetTapState,
    ],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        shouldIgnoreTouch.current = false;
        return;
      }

      cancelLongPressTimer();

      const touchEndTime = Date.now();
      const touchEndPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      const touchDuration = touchEndTime - touchStartTime.current;
      const deltaX = touchEndPosition.x - touchStartPosition.current.x;
      const deltaY = touchEndPosition.y - touchStartPosition.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Release the hold without treating it as a tap or swipe, committing
      // the seek if it turned into a drag
      if (isLongPressing.current) {
        isLongPressing.current = false;
        if (gestureType.current === "holdDrag") {
          onHoldDragEnd?.(deltaX);
        } else {
          onLongPressEnd?.();
        }
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // End vertical drag if we were dragging
      if (
        isDragging.current &&
        dragSide.current &&
        gestureType.current === "vertical"
      ) {
        onVerticalDragEnd?.(dragSide.current);
        isDragging.current = false;
        dragSide.current = null;
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // Check if gesture is too long for discrete actions
      if (touchDuration > maxDuration) {
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // Handle discrete horizontal swipes (for skip) only if it was marked as horizontal
      if (
        gestureType.current === "horizontal" &&
        hasMovedEnough.current &&
        absX > absY &&
        totalDistance > minDistance
      ) {
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else if (
        !hasMovedEnough.current &&
        touchDuration < 300 &&
        totalDistance < 10
      ) {
        // It's a tap - short duration and small movement
        const tapSide = touchEndPosition.x < screenWidth / 2 ? "left" : "right";
        const isDoubleTap =
          lastTapSide.current === tapSide &&
          touchEndTime - lastTapTime.current <= doubleTapDelay;

        if (isDoubleTap) {
          clearSingleTapTimeout();
          resetTapState();

          if (tapSide === "left") {
            onDoubleTapLeft?.();
          } else {
            onDoubleTapRight?.();
          }
        } else {
          clearSingleTapTimeout();
          lastTapTime.current = touchEndTime;
          lastTapSide.current = tapSide;
          singleTapTimeoutRef.current = setTimeout(() => {
            onTap?.();
            resetTapState();
            singleTapTimeoutRef.current = null;
          }, doubleTapDelay);
        }
      }

      hasMovedEnough.current = false;
      gestureType.current = "none";
    },
    [
      cancelLongPressTimer,
      clearSingleTapTimeout,
      doubleTapDelay,
      onDoubleTapLeft,
      onDoubleTapRight,
      maxDuration,
      minDistance,
      onHoldDragEnd,
      onLongPressEnd,
      onSwipeLeft,
      onSwipeRight,
      onVerticalDragEnd,
      onTap,
      resetTapState,
      screenWidth,
    ],
  );

  // A cancelled touch never delivers touchEnd, so release whatever is
  // engaged without treating it as a tap or swipe
  const handleTouchCancel = useCallback(() => {
    cancelLongPressTimer();
    if (isLongPressing.current) {
      isLongPressing.current = false;
      if (gestureType.current === "holdDrag") {
        // Nobody chose a position, so the seek goes back to where it started
        onHoldDragEnd?.(0);
      } else {
        onLongPressEnd?.();
      }
    }
    if (isDragging.current && dragSide.current) {
      onVerticalDragEnd?.(dragSide.current);
    }
    isDragging.current = false;
    dragSide.current = null;
    hasMovedEnough.current = false;
    gestureType.current = "none";
    shouldIgnoreTouch.current = false;
  }, [cancelLongPressTimer, onHoldDragEnd, onLongPressEnd, onVerticalDragEnd]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
};
