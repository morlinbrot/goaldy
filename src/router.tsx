import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { AuthProvider } from "./contexts/AuthContext";
import { DebugProvider } from "./contexts/DebugContext";
import { RepositoryProvider } from "./contexts/RepositoryContext";
import { SyncProvider } from "./contexts/SyncContext";
import { RootLayout } from "./routes/RootLayout";
import { LoginRoute } from "./routes/auth/login";
import { SignupRoute } from "./routes/auth/signup";
import { FeedbackRoute } from "./routes/feedback";
import { GoalAllocationRoute } from "./routes/goals/allocation";
import { GoalCheckInRoute } from "./routes/goals/checkin";
import { GoalCreateRoute } from "./routes/goals/create";
import { GoalDetailRoute } from "./routes/goals/detail";
import { GoalsIndexRoute } from "./routes/goals/index";
import { HabitCreateRoute } from "./routes/habits/create";
import { HabitDetailRoute } from "./routes/habits/detail";
import { HabitsIndexRoute } from "./routes/habits/index";
import { HomeRoute } from "./routes/home";
import { SettingsRoute } from "./routes/settings";
import { SetupRoute } from "./routes/setup";

// Root route with providers
const rootRoute = createRootRoute({
  component: () => (
    <AuthProvider>
      <RepositoryProvider>
        <SyncProvider>
          <DebugProvider>
            {/*<AutoshipProvider
              supabaseUrl={SUPABASE_URL}
              supabaseAnonKey={SUPABASE_ANON_KEY}
            >*/}
              <RootLayout>
                <Outlet />
              </RootLayout>
              {/*<AutoshipButton position="bottom-left" />*/}
            {/*</AutoshipProvider>*/}
          </DebugProvider>
        </SyncProvider>
      </RepositoryProvider>
    </AuthProvider>
  ),
});

// Auth routes
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginRoute,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: SignupRoute,
});

// Main app routes
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupRoute,
});

const feedbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/feedback",
  component: FeedbackRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

// Goals routes
const goalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals",
  component: GoalsIndexRoute,
});

const goalCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/create",
  component: GoalCreateRoute,
});

const goalDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/$goalId",
  component: GoalDetailRoute,
});

const goalCheckInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/$goalId/checkin",
  component: GoalCheckInRoute,
});

const goalAllocationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/allocation",
  component: GoalAllocationRoute,
});

// Habits routes
const habitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits",
  component: HabitsIndexRoute,
});

const habitCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits/create",
  component: HabitCreateRoute,
});

const habitDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits/$habitId",
  component: HabitDetailRoute,
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  homeRoute,
  setupRoute,
  feedbackRoute,
  settingsRoute,
  goalsRoute,
  goalCreateRoute,
  goalDetailRoute,
  goalCheckInRoute,
  goalAllocationRoute,
  habitsRoute,
  habitCreateRoute,
  habitDetailRoute,
]);

// Create and export the router
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

// Type declaration for router
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
