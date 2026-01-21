import { BottomNav } from "@/components/BottomNav";
import { PermissionPrompt } from "@/components/PermissionPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { hasCompletedOnboarding } from "@/lib/auth";
import { getCurrentBudget } from "@/lib/database";
import { initializeNotifications } from "@/lib/notification-scheduler";
import type { Budget } from "@/lib/types";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface AppState {
  budget: Budget | null;
  setBudget: (budget: Budget | null) => void;
  isLoadingBudget: boolean;
}

const AppStateContext = createContext<AppState | null>(null);

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within RootLayout");
  }
  return context;
}

interface RootLayoutProps {
  children: ReactNode;
}

export function RootLayout({ children }: RootLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading: authLoading,
    skipAuth,
    isConfigured,
    hasSkippedAuth,
  } = useAuth();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load budget when authenticated or skipped auth
  const loadBudget = useCallback(async () => {
    setIsLoadingBudget(true);
    try {
      const currentBudget = await getCurrentBudget();
      setBudget(currentBudget);

      if (currentBudget) {
        // Only navigate if we're on auth routes or just initialized
        if (location.pathname === "/login" || location.pathname === "/signup") {
          navigate({ to: "/" });
        }
        // Show permission prompt when user has a budget (not first-time setup)
        setShowPermissionPrompt(true);
      } else {
        navigate({ to: "/setup" });
      }

      // Initialize notifications after app is ready
      initializeNotifications().catch(err => {
        console.error('Failed to initialize notifications:', err);
      });
    } catch (error) {
      console.error('Failed to load budget:', error);
      navigate({ to: "/setup" });
    } finally {
      setIsLoadingBudget(false);
      setIsInitialized(true);
    }
  }, [navigate, location.pathname]);

  // Determine initial view based on auth state
  useEffect(() => {
    async function determineView() {
      if (authLoading) {
        return;
      }

      // If authenticated or skipped auth, load budget
      if (isAuthenticated || hasSkippedAuth) {
        await loadBudget();
        return;
      }

      // If Supabase is not configured, skip auth automatically
      if (!isConfigured) {
        console.log('[App] Supabase not configured, skipping auth');
        skipAuth();
        return;
      }

      // Check if user has used the app before
      console.log('[App] Checking onboarding status');
      const hasOnboarded = await hasCompletedOnboarding();
      console.log('[App] hasOnboarded:', hasOnboarded);
      // Show login for both new and returning users
      navigate({ to: "/login" });
      setIsInitialized(true);
    }
    determineView();
  }, [authLoading, isAuthenticated, hasSkippedAuth, isConfigured, skipAuth, loadBudget, navigate]);

  // Back navigation handler using router history
  const handleBack = useMemo(() => {
    // Don't allow back navigation from root pages
    const rootPaths = ["/", "/login", "/signup", "/setup"];
    if (rootPaths.includes(location.pathname)) return null;

    return () => {
      router.history.back();
    };
  }, [location.pathname, router.history]);

  // Hook up swipe-back (iOS) and system back (Android)
  useBackNavigation(handleBack);

  // Show bottom nav on main app views (not auth screens)
  const showBottomNav = !location.pathname.startsWith("/login") &&
                        !location.pathname.startsWith("/signup") &&
                        isInitialized;

  // Show loading screen while checking auth or loading budget
  if (authLoading || isLoadingBudget || !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const appState: AppState = {
    budget,
    setBudget,
    isLoadingBudget,
  };

  return (
    <AppStateContext.Provider value={appState}>
      <div className={showBottomNav ? "pb-16" : ""}>
        {children}
        {/* Bottom navigation */}
        {showBottomNav && <BottomNav />}
        {/* Permission prompt overlay */}
        {showPermissionPrompt && (
          <PermissionPrompt onComplete={() => setShowPermissionPrompt(false)} />
        )}
      </div>
    </AppStateContext.Provider>
  );
}
