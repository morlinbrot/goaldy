import { LoginScreen } from "@/components/auth/LoginScreen";
import { SignupScreen } from "@/components/auth/SignupScreen";
import { BudgetSetup } from "@/components/BudgetSetup";
import { FeedbackButton } from "@/components/FeedbackButton";
import { FeedbackList } from "@/components/FeedbackList";
import {
    AllocationView,
    GoalCreationForm,
    GoalDashboard,
    GoalsList,
    MonthlyCheckIn,
} from "@/components/goals";
import { HomeScreen } from "@/components/HomeScreen";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { hasCompletedOnboarding } from "@/lib/auth";
import { createOrUpdateBudget, getCurrentBudget, getSavingsGoalWithStats } from "@/lib/database";
import { initializeNotifications } from "@/lib/notification-scheduler";
import type { Budget, SavingsGoalWithStats } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type View =
  | "loading"
  | "login"
  | "signup"
  | "home"
  | "setup"
  | "feedback"
  | "goals"
  | "goal-create"
  | "goal-detail"
  | "goal-checkin"
  | "goal-allocation"
  | "settings";

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
  const { refreshStatus } = useSync();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(false);
  const [view, setView] = useState<View>("loading");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoalWithStats | null>(null);

  // Load budget when authenticated or skipped auth
  const loadBudget = useCallback(async () => {
    setIsLoadingBudget(true);
    try {
      const currentBudget = await getCurrentBudget();
      setBudget(currentBudget);
      setView(currentBudget ? "home" : "setup");

      // Initialize notifications after app is ready
      initializeNotifications().catch(err => {
        console.error('Failed to initialize notifications:', err);
      });
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
      if (authLoading) {
        setView("loading");
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

  // Load goal data - must be defined before early return
  const loadGoalData = useCallback(async (goalId: string) => {
    const goalData = await getSavingsGoalWithStats(goalId);
    setSelectedGoal(goalData);
  }, []);

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

  // Goal navigation handlers
  const handleGoalCreated = async () => {
    await refreshStatus();
    setView("goals");
  };

  const handleSelectGoal = async (goalId: string) => {
    setSelectedGoalId(goalId);
    await loadGoalData(goalId);
    setView("goal-detail");
  };

  const handleGoalCheckIn = (goalId: string) => {
    setSelectedGoalId(goalId);
    setView("goal-checkin");
  };

  const handleGoalDeleted = async () => {
    await refreshStatus();
    setSelectedGoalId(null);
    setSelectedGoal(null);
    setView("goals");
  };

  const handleGoalUpdated = async () => {
    if (selectedGoalId) {
      await loadGoalData(selectedGoalId);
    }
    await refreshStatus();
  };

  const handleCheckInComplete = async () => {
    await refreshStatus();
    if (selectedGoalId) {
      await loadGoalData(selectedGoalId);
      setView("goal-detail");
    } else {
      setView("goals");
    }
  };

  const handleAllocationSaved = async () => {
    await refreshStatus();
    setView("goals");
  };

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
      case "goals":
        return (
          <GoalsList
            onBack={() => setView("home")}
            onCreateGoal={() => setView("goal-create")}
            onSelectGoal={handleSelectGoal}
            onAllocation={() => setView("goal-allocation")}
          />
        );
      case "goal-create":
        return (
          <GoalCreationForm
            onGoalCreated={handleGoalCreated}
            onBack={() => setView("goals")}
          />
        );
      case "goal-detail":
        if (!selectedGoalId || !selectedGoal) {
          setView("goals");
          return null;
        }
        return (
          <GoalDashboard
            goal={selectedGoal}
            onBack={() => setView("goals")}
            onCheckIn={handleGoalCheckIn}
            onDeleted={handleGoalDeleted}
            onUpdated={handleGoalUpdated}
          />
        );
      case "goal-checkin":
        if (!selectedGoalId) {
          setView("goals");
          return null;
        }
        return (
          <MonthlyCheckIn
            goalId={selectedGoalId}
            onComplete={handleCheckInComplete}
            onBack={() => setView("goal-detail")}
          />
        );
      case "goal-allocation":
        return (
          <AllocationView
            onBack={() => setView("goals")}
            onSaved={handleAllocationSaved}
          />
        );
      case "settings":
        return (
          <NotificationSettings
            onBack={() => setView("home")}
          />
        );
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
            onViewGoals={() => setView("goals")}
            onViewSettings={() => setView("settings")}
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
