import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

function getInitials(email: string): string {
  const name = email.split("@")[0];
  if (name.length <= 2) {
    return name.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function UserAvatar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const initials = getInitials(user.email);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          aria-label="User menu"
        >
          <span className="text-sm font-medium">{initials}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm truncate">{user.email}</span>
          </div>
          <hr className="my-1" />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Log out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
