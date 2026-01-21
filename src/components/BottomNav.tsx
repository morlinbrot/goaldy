import { cn } from "@/lib/utils";
import { Home, MessageSquare, Settings, Target } from "lucide-react";

type NavItem = "home" | "goals" | "feedback" | "settings";

interface BottomNavProps {
  active: NavItem;
  onNavigate: (item: NavItem) => void;
}

const navItems: { id: NavItem; icon: typeof Home; label: string }[] = [
  { id: "settings", icon: Settings, label: "Settings" },
  { id: "feedback", icon: MessageSquare, label: "Feedback" },
  { id: "goals", icon: Target, label: "Goals" },
  { id: "home", icon: Home, label: "Home" },
];

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-center">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
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
          </button>
        ))}
      </div>
    </nav>
  );
}
