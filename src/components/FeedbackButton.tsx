import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackModal } from "./FeedbackModal";

interface FeedbackButtonProps {
  className?: string;
}

export function FeedbackButton({ className }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50",
          "w-12 h-12 rounded-full",
          "bg-muted/80 backdrop-blur-sm border shadow-lg",
          "flex items-center justify-center",
          "hover:bg-muted active:scale-95 transition-all",
          className
        )}
        aria-label="Add feedback note"
      >
        <MessageSquarePlus className="w-5 h-5 text-muted-foreground" />
      </button>

      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
