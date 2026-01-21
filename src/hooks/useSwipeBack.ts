import { useEffect, useRef } from "react";

const EDGE_THRESHOLD = 30; // pixels from left edge to start swipe
const SWIPE_THRESHOLD = 100; // minimum horizontal distance to trigger back

export function useSwipeBack(onBack: (() => void) | null) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!onBack) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      // Only start tracking if touch begins near left edge
      if (touch.clientX <= EDGE_THRESHOLD) {
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = Math.abs(touch.clientY - touchStartY.current);

      // Cancel if vertical movement is greater (user is scrolling)
      if (deltaY > Math.abs(deltaX)) {
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX.current;

      // Trigger back if swiped far enough to the right
      if (deltaX >= SWIPE_THRESHOLD) {
        onBack();
      }

      touchStartX.current = null;
      touchStartY.current = null;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onBack]);
}
