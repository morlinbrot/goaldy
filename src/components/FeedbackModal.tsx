import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addFeedbackNote } from "@/lib/database";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!content.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await addFeedbackNote(content.trim());
      setContent("");
      onClose();
    } catch (error) {
      console.error("Failed to save feedback note:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative w-full sm:max-w-md mx-4 mb-4 sm:mb-0",
          "bg-background rounded-xl border shadow-xl",
          "animate-in fade-in slide-in-from-bottom-4 duration-200"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Quick Feedback</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What could be improved? Note it down..."
            className={cn(
              "w-full h-32 p-3 rounded-lg resize-none",
              "bg-muted/50 border-0",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/20"
            )}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Press Cmd+Enter to save
          </p>
        </div>

        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!content.trim() || isSaving}
          >
            {isSaving ? "Saving..." : "Save Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}
