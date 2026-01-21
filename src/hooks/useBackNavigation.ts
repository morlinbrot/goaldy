import { useAndroidBack } from "./useAndroidBack";
import { usePlatform } from "./usePlatform";
import { useSwipeBack } from "./useSwipeBack";

export function useBackNavigation(onBack: (() => void) | null) {
  const { isIOS, isAndroid } = usePlatform();

  // iOS: swipe from left edge to go back
  useSwipeBack(isIOS && onBack ? onBack : null);

  // Android: system back button/gesture
  useAndroidBack(isAndroid && onBack ? onBack : null);
}
