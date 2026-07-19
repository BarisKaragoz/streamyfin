import { useCallback, useEffect, useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import { CONTROLS_CONSTANTS } from "../constants";

export interface SwipeGestureOptions {
  minDistance?: number;
  maxDuration?: number;
  doubleTapDelay?: number;
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
  holdDragEnabled?: boolean;
  holdDuration?: number;
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
  onSwipeLeft,
  onSwipeRight,
  onVerticalDragStart,
  onVerticalDragMove,
  onVerticalDragEnd,
  onTap,
  onDoubleTapLeft,
  onDoubleTapRight,
  leftEdgeExclusionPx = 0,
  holdDragEnabled = false,
  holdDuration = CONTROLS_CONSTANTS.HOLD_DRAG_ACTIVATE_MS,
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
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSingleTapTimeout = useCallback(() => {
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
  }, []);

  const clearHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  const resetTapState = useCallback(() => {
    lastTapTime.current = 0;
    lastTapSide.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearSingleTapTimeout();
      clearHoldTimeout();
    };
  }, [clearSingleTapTimeout, clearHoldTimeout]);

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
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

      // Tap-hold-drag seek: activate after holding still for holdDuration
      clearHoldTimeout();
      if (holdDragEnabled) {
        holdTimeoutRef.current = setTimeout(() => {
          holdTimeoutRef.current = null;
          // Only activate if no other gesture has claimed this touch
          if (gestureType.current !== "none") return;
          clearSingleTapTimeout();
          resetTapState();
          gestureType.current = "holdDrag";
          onHoldDragStart?.();
        }, holdDuration);
      }
    },
    [
      screenHeight,
      leftEdgeExclusionPx,
      holdDragEnabled,
      holdDuration,
      onHoldDragStart,
      clearHoldTimeout,
      clearSingleTapTimeout,
      resetTapState,
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

      // Hold-drag seek is active - all movement adjusts the seek offset
      if (gestureType.current === "holdDrag") {
        onHoldDragMove?.(deltaX);
        lastTouchPosition.current = currentPosition;
        return;
      }

      // Lower threshold for starting gestures - make it more sensitive
      if (!hasMovedEnough.current && totalDistance > 8) {
        hasMovedEnough.current = true;

        // Determine gesture type based on initial movement direction
        if (absY > absX && absY > 5) {
          // Vertical gesture - start drag immediately
          clearHoldTimeout();
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
          clearHoldTimeout();
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
      clearHoldTimeout,
      clearSingleTapTimeout,
      onHoldDragMove,
      onVerticalDragStart,
      onVerticalDragMove,
      resetTapState,
      screenWidth,
    ],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        shouldIgnoreTouch.current = false;
        return;
      }

      clearHoldTimeout();

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

      // Commit hold-drag seek on release
      if (gestureType.current === "holdDrag") {
        onHoldDragEnd?.(deltaX);
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
      clearHoldTimeout,
      clearSingleTapTimeout,
      doubleTapDelay,
      onDoubleTapLeft,
      onDoubleTapRight,
      maxDuration,
      minDistance,
      onHoldDragEnd,
      onSwipeLeft,
      onSwipeRight,
      onVerticalDragEnd,
      onTap,
      resetTapState,
      screenWidth,
    ],
  );

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};
