import { useMemo } from "react";

export function usePlatform() {
  return useMemo(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const isAndroid = /Android/.test(ua);
    const isMobile = isIOS || isAndroid;
    return { isIOS, isAndroid, isMobile };
  }, []);
}
