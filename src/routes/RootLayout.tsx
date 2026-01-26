import { BottomNav } from "@/components/BottomNav";
import { PermissionPrompt } from "@/components/PermissionPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { useBudgetsRepository } from "@/contexts/RepositoryContext";
import { useSync } from "@/contexts/SyncContext";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { initializeNotifications } from "@/lib/notification-scheduler";
import type { Budget } from "@/lib/types";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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
  } = useAuth();
  const { isReady: isSyncReady, hasCompletedInitialSync } = useSync();
  const budgetsRepo = useBudgetsRepository();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Subscribe to budget repository changes for sync updates
  useEffect(() => {
    const loadCurrentBudget = async () => {
      try {
        const currentBudget = await budgetsRepo.getCurrentBudget();
        setBudget(currentBudget);
      } catch (error) {
        console.error('Failed to reload budget:', error);
      }
    };

    const unsubscribe = budgetsRepo.subscribe(() => {
      // Reload current budget when any budget data changes
      loadCurrentBudget();
    });

    return unsubscribe;
  }, [budgetsRepo]);

  // Determine initial view based on auth state - runs only once on mount
  useEffect(() => {
    // Skip if already initialized
    if (isInitialized) return;

    // Wait for auth to finish loading
    if (authLoading) return;

    // Wait for sync service to be ready (repositories initialized)
    if (!isSyncReady) {
      console.log('[App] Waiting for sync service to be ready...');
      return;
    }

    async function initializeApp() {
      // If not authenticated, always redirect to login
      if (!isAuthenticated) {
        console.log('[App] Not authenticated, redirecting to login');
        navigate({ to: "/login" });
        setIsInitialized(true);
        return;
      }

      // Wait for the initial sync to complete
      // This is critical for fresh installs - we need to pull remote data first
      if (!hasCompletedInitialSync) {
        console.log('[App] Waiting for initial sync to complete...');
        return; // Will re-run when hasCompletedInitialSync becomes true
      }

      console.log('[App] Initial sync completed, checking for budget...');

      // Load budget from local database (which now includes any synced remote data)
      try {
        const currentBudget = await budgetsRepo.getCurrentBudget();
        console.log('[App] Current budget after sync:', currentBudget);
        setBudget(currentBudget);

        if (currentBudget && currentBudget.total_amount > 0) {
          // User has a budget, show main app
          console.log('[App] Budget found, showing main app');
          setShowPermissionPrompt(true);
          // Navigate to home if on auth routes
          if (location.pathname === "/login" || location.pathname === "/signup") {
            navigate({ to: "/" });
          }
        } else {
          // No budget locally or remotely, show setup
          console.log('[App] No budget found, showing setup');
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
  }, [authLoading, isAuthenticated, isSyncReady, hasCompletedInitialSync]);

  // Handle navigation after login (when already initialized)
  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) return;

    // If user just logged in and is still on auth routes, redirect to home
    if (location.pathname === "/login" || location.pathname === "/signup") {
      navigate({ to: "/" });
    }
  }, [isInitialized, isAuthenticated, location.pathname, navigate]);

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

  // Determine what we're waiting for to show appropriate loading message
  const getLoadingMessage = () => {
    if (authLoading) return "Checking authentication...";
    if (!isSyncReady) return "Initializing...";
    if (isAuthenticated && !hasCompletedInitialSync) return "Syncing data...";
    return "Loading...";
  };

  // Show loading screen until all initialization is complete
  if (authLoading || !isInitialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{getLoadingMessage()}</p>
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
