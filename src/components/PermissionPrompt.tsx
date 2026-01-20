import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkNotificationPermission, type PermissionStatus, requestNotificationPermission } from "@/lib/notifications";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";

const PERMISSION_PROMPT_DISMISSED_KEY = 'goaldy_permission_prompt_dismissed';

interface PermissionPromptProps {
  onComplete: () => void;
}

export function PermissionPrompt({ onComplete }: PermissionPromptProps) {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | 'loading'>('loading');
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      // Check if user already dismissed the prompt
      const dismissed = localStorage.getItem(PERMISSION_PROMPT_DISMISSED_KEY);
      if (dismissed) {
        onComplete();
        return;
      }

      const status = await checkNotificationPermission();
      setPermissionStatus(status);

      // If already granted or unavailable, skip the prompt
      if (status === 'granted' || status === 'unavailable') {
        onComplete();
      }
    }
    checkStatus();
  }, [onComplete]);

  const handleEnable = async () => {
    setIsRequesting(true);
    const status = await requestNotificationPermission();
    setPermissionStatus(status);
    setIsRequesting(false);

    // Complete regardless of result - user made a choice
    onComplete();
  };

  const handleSkip = () => {
    // Remember that user dismissed the prompt (for this session)
    localStorage.setItem(PERMISSION_PROMPT_DISMISSED_KEY, 'true');
    onComplete();
  };

  // Still loading or already handled
  if (permissionStatus === 'loading' || permissionStatus === 'granted' || permissionStatus === 'unavailable') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-sm animate-in fade-in zoom-in duration-200">
        <CardContent className="p-6">
          <button
            onClick={handleSkip}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Bell className="w-8 h-8 text-primary" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Stay on Track</h2>
              <p className="text-muted-foreground">
                Enable notifications to get reminders about your savings goals and monthly check-ins.
              </p>
            </div>

            <div className="flex flex-col w-full gap-2 pt-2">
              <Button
                onClick={handleEnable}
                disabled={isRequesting}
                className="w-full"
              >
                {isRequesting ? 'Enabling...' : 'Enable Notifications'}
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={isRequesting}
                className="w-full text-muted-foreground"
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
