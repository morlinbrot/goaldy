import { cn } from "@/lib/utils";

interface NumpadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  disabled?: boolean;
}

export function Numpad({ value, onChange, onConfirm, disabled }: NumpadProps) {
  const handleDigit = (digit: string) => {
    if (disabled) return;

    // Prevent multiple decimal points
    if (digit === '.' && value.includes('.')) return;

    // Limit decimal places to 2
    if (value.includes('.')) {
      const [, decimal] = value.split('.');
      if (decimal && decimal.length >= 2) return;
    }

    // Prevent leading zeros (except for decimals)
    if (value === '0' && digit !== '.') {
      onChange(digit);
      return;
    }

    onChange(value + digit);
  };

  const handleBackspace = () => {
    if (disabled) return;
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
  };

  const buttons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '.', '0', 'backspace',
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {buttons.map((btn) => (
        <button
          key={btn}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (btn === 'backspace') {
              handleBackspace();
            } else {
              handleDigit(btn);
            }
          }}
          onDoubleClick={() => {
            if (btn === 'backspace') {
              handleClear();
            }
          }}
          className={cn(
            "h-14 rounded-xl text-2xl font-medium transition-all",
            "bg-secondary hover:bg-secondary/80 active:scale-95",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            btn === 'backspace' && "text-lg"
          )}
        >
          {btn === 'backspace' ? '⌫' : btn}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled || !value || parseFloat(value) <= 0}
        onClick={onConfirm}
        className={cn(
          "col-span-3 h-14 rounded-xl text-xl font-semibold transition-all",
          "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        Add Expense
      </button>
    </div>
  );
}
