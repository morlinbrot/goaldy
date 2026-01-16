import { BudgetSetup } from "@/components/BudgetSetup";
import { FeedbackButton } from "@/components/FeedbackButton";
import { FeedbackList } from "@/components/FeedbackList";
import { HomeScreen } from "@/components/HomeScreen";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { SignupScreen } from "@/components/auth/SignupScreen";
import { useAuth } from "@/contexts/AuthContext";
import { hasCompletedOnboarding } from "@/lib/auth";
import { createOrUpdateBudget, getCurrentBudget } from "@/lib/database";
import type { Budget } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type View = "loading" | "login" | "signup" | "home" | "setup" | "feedback";

function App() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    login,
    signup,
    clearError,
    skipAuth,
    isConfigured,
    hasSkippedAuth,
  } = useAuth();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(false);
  const [view, setView] = useState<View>("loading");

  // Load budget when authenticated or skipped auth
  const loadBudget = useCallback(async () => {
    setIsLoadingBudget(true);
    try {
      const currentBudget = await getCurrentBudget();
      setBudget(currentBudget);
      setView(currentBudget ? "home" : "setup");
    } catch (error) {
      console.error('Failed to load budget:', error);
      setView("setup");
    } finally {
      setIsLoadingBudget(false);
    }
  }, []);

  // Determine initial view based on auth state
  useEffect(() => {
    async function determineView() {
      console.log('[App] determineView called', { authLoading, isAuthenticated, hasSkippedAuth, isConfigured });

      if (authLoading) {
        console.log('[App] Auth is loading, staying on loading view');
        setView("loading");
        return;
      }

      // If authenticated or skipped auth, load budget
      if (isAuthenticated || hasSkippedAuth) {
        console.log('[App] Authenticated or skipped, loading budget');
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
      if (hasOnboarded) {
        // Returning user with local data - show login option
        setView("login");
      } else {
        // New user - show login option
        setView("login");
      }
    }
    determineView();
  }, [authLoading, isAuthenticated, hasSkippedAuth, isConfigured, skipAuth, loadBudget]);

  const handleSaveBudget = async (totalAmount: number, spendingLimit?: number) => {
    try {
      const newBudget = await createOrUpdateBudget(totalAmount, spendingLimit);
      setBudget(newBudget);
      setView("home");
    } catch (error) {
      console.error('Failed to save budget:', error);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    // After successful login, loadBudget will be triggered by the useEffect
  };

  const handleSignup = async (email: string, password: string) => {
    await signup(email, password);
    // After successful signup, loadBudget will be triggered by the useEffect
  };

  const handleSkipAuth = () => {
    clearError();
    skipAuth();
  };

  // Show loading screen while checking auth or loading budget
  if (view === "loading" || (authLoading || isLoadingBudget)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Render based on current view
  const renderView = () => {
    switch (view) {
      case "login":
        return (
          <LoginScreen
            onLogin={handleLogin}
            onSignupClick={() => { clearError(); setView("signup"); }}
            onSkip={handleSkipAuth}
            error={authError}
            isLoading={authLoading}
          />
        );
      case "signup":
        return (
          <SignupScreen
            onSignup={handleSignup}
            onLoginClick={() => { clearError(); setView("login"); }}
            error={authError}
            isLoading={authLoading}
          />
        );
      case "setup":
        return (
          <BudgetSetup
            onSave={handleSaveBudget}
            initialAmount={budget?.total_amount}
          />
        );
      case "feedback":
        return <FeedbackList onBack={() => setView("home")} />;
      case "home":
      default:
        if (!budget) {
          setView("setup");
          return null;
        }
        return (
          <HomeScreen
            budget={budget}
            onEditBudget={() => setView("setup")}
            onViewFeedback={() => setView("feedback")}
          />
        );
    }
  };

  return (
    <>
      {renderView()}
      {/* Show feedback button on home and setup views */}
      {(view === "home" || view === "setup") && <FeedbackButton />}
    </>
  );
}

export default App;
