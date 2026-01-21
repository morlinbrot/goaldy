import { ArrowLeft } from "lucide-react";
import { FeedbackButton } from "./FeedbackButton";
import { SyncIndicator } from "./SyncIndicator";
import { Button } from "./ui/button";

interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  children?: React.ReactNode;
}

export function AppHeader({ title, onBack, children }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <h1 className="text-xl font-semibold truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <SyncIndicator />
        <FeedbackButton />
        {children}
      </div>
    </header>
  );
}
