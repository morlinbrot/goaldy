import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

interface CategorySelectorProps {
  categories: Category[];
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
}

export function CategorySelector({ categories, selected, onSelect }: CategorySelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(selected === category.id ? null : category.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all",
            "border-2",
            selected === category.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-transparent bg-secondary hover:bg-secondary/80"
          )}
          style={{
            borderColor: selected === category.id ? category.color || undefined : undefined,
            backgroundColor: selected === category.id ? `${category.color}20` : undefined,
          }}
        >
          <span>{category.icon}</span>
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  );
}
