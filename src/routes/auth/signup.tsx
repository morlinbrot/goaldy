import { SignupScreen } from "@/components/auth/SignupScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";

export function SignupRoute() {
  const navigate = useNavigate();
  const { signup, clearError, error: authError, isLoading: authLoading } = useAuth();

  const handleSignup = async (email: string, password: string) => {
    await signup(email, password);
    // Navigation will be handled by RootLayout after auth state changes
  };

  return (
    <SignupScreen
      onSignup={handleSignup}
      onLoginClick={() => { clearError(); navigate({ to: "/login" }); }}
      error={authError}
      isLoading={authLoading}
    />
  );
}
