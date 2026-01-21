import { deleteFeedbackNote, getFeedbackNotes } from "@/lib/database";
import type { FeedbackNote } from "@/lib/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";

export function FeedbackList() {
  const [notes, setNotes] = useState<FeedbackNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotes = async () => {
    try {
      const data = await getFeedbackNotes();
      setNotes(data);
    } catch (error) {
      console.error("Failed to load feedback notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteFeedbackNote(id);
      setNotes(notes.filter((n) => n.id !== id));
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <AppHeader title="Feedback Notes" />

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No feedback notes yet</p>
            <p className="text-sm mt-1">
              Tap the icon in the corner to add one
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="bg-card border rounded-lg p-4 relative group"
              >
                <button
                  onClick={() => handleDelete(note.id)}
                  className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-opacity"
                  aria-label="Delete note"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <p className="whitespace-pre-wrap pr-8">{note.content}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDate(note.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
