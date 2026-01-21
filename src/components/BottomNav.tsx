import { cn } from "@/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, MessageSquare, Settings, Target } from "lucide-react";

type NavItem = "home" | "goals" | "feedback" | "settings";

const navItems: { id: NavItem; icon: typeof Home; label: string; to: string }[] = [
  { id: "settings", icon: Settings, label: "Settings", to: "/settings" },
  { id: "feedback", icon: MessageSquare, label: "Feedback", to: "/feedback" },
  { id: "goals", icon: Target, label: "Goals", to: "/goals" },
  { id: "home", icon: Home, label: "Home", to: "/" },
];

export function BottomNav() {
  const location = useLocation();

  // Determine active item based on current path
  const getActiveItem = (): NavItem => {
    const path = location.pathname;
    if (path === "/" || path === "/setup") return "home";
    if (path.startsWith("/goals")) return "goals";
    if (path === "/feedback") return "feedback";
    if (path === "/settings") return "settings";
    return "home";
  };

  const active = getActiveItem();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-center">
        {navItems.map(({ id, icon: Icon, label, to }) => (
          <Link
            key={id}
            to={to}
            className={cn(
              "flex flex-col items-center py-2 px-6 min-w-[72px]",
              "transition-colors",
              active === id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs mt-1">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
