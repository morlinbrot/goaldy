import { BottomNav } from "@/components/BottomNav";
import { PermissionPrompt } from "@/components/PermissionPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { useBudgetsRepository } from "@/contexts/RepositoryContext";
import { useSync } from "@/contexts/SyncContext";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { initializeNotifications } from "@/lib/notification-scheduler";
import type { Budget } from "@/lib/types";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface AppState {
  budget: Budget | null;
  setBudget: (budget: Budget | null) => void;
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
  const { sync } = useSync();
  const budgetsRepo = useBudgetsRepository();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Determine initial view based on auth state - runs only once on mount
  useEffect(() => {
    // Skip if already initialized
    if (isInitialized) return;

    // Wait for auth to finish loading
    if (authLoading) return;

    async function initializeApp() {
      // If Supabase is not configured, skip auth automatically and continue
      if (!isConfigured && !hasSkippedAuth) {
        console.log('[App] Supabase not configured, skipping auth');
        skipAuth();
        // Don't return - skipAuth will trigger a re-render with hasSkippedAuth=true
        return;
      }

      // If not authenticated and hasn't skipped, show login
      if (!isAuthenticated && !hasSkippedAuth) {
        navigate({ to: "/login" });
        setIsInitialized(true);
        return;
      }

      // At this point we're either authenticated or skipped auth
      // If authenticated, do initial sync to get data from other devices
      if (isAuthenticated) {
        try {
          console.log('[App] Running initial sync...');
          await sync();
          console.log('[App] Initial sync complete');
        } catch (err) {
          console.warn('[App] Failed to sync during init:', err);
          // Continue anyway - we'll check local budget
        }
      }

      // Load budget from local database
      try {
        const currentBudget = await budgetsRepo.getCurrentBudget();
        setBudget(currentBudget);

        if (currentBudget && currentBudget.total_amount > 0) {
          // User has a budget, show main app
          setShowPermissionPrompt(true);
          // Navigate to home if on auth routes
          if (location.pathname === "/login" || location.pathname === "/signup") {
            navigate({ to: "/" });
          }
        } else {
          // No budget, show setup
          navigate({ to: "/setup" });
        }

        // Initialize notifications after app is ready
        initializeNotifications().catch(err => {
          console.error('Failed to initialize notifications:', err);
        });
      } catch (error) {
        console.error('Failed to load budget:', error);
        navigate({ to: "/setup" });
      }

      setIsInitialized(true);
    }

    initializeApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, hasSkippedAuth, isConfigured]);

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

  // Show loading screen only during initial auth check
  if (authLoading || !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const appState: AppState = {
    budget,
    setBudget,
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
