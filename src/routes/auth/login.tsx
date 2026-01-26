import { LoginScreen } from "@/components/auth/LoginScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";

export function LoginRoute() {
  const navigate = useNavigate();
  const { login, clearError, error: authError, isLoading: authLoading } = useAuth();

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    // Navigation will be handled by RootLayout after auth state changes
  };

  return (
    <LoginScreen
      onLogin={handleLogin}
      onSignupClick={() => { clearError(); navigate({ to: "/signup" }); }}
      error={authError}
      isLoading={authLoading}
    />
  );
}
