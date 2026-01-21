import { useEffect, useRef } from "react";

export function useAndroidBack(onBack: (() => void) | null) {
  const hasSetupHistory = useRef(false);

  useEffect(() => {
    if (!onBack) return;

    // Push a dummy state to history so we can intercept the back button
    if (!hasSetupHistory.current) {
      window.history.pushState({ navGuard: true }, "");
      hasSetupHistory.current = true;
    }

    const handlePopState = () => {
      // Re-push state to keep intercepting back button
      window.history.pushState({ navGuard: true }, "");
      onBack();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onBack]);
}
