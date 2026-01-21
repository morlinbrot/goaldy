import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { FeedbackModal } from "./FeedbackModal";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        aria-label="Add feedback note"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </Button>

      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
