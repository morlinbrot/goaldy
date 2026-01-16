import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface BudgetSetupProps {
  onSave: (totalAmount: number, spendingLimit?: number) => void;
  initialAmount?: number;
}

export function BudgetSetup({ onSave, initialAmount }: BudgetSetupProps) {
  const [amount, setAmount] = useState(initialAmount?.toString() || '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);

    if (isNaN(value) || value <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setError('');
    onSave(value);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Goaldy</CardTitle>
          <CardDescription className="text-base">
            How much do you have available to spend this month?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">
                  €
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="2,000"
                  className="pl-10 text-2xl h-14 text-center"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full h-12 text-lg">
              Set My Budget
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
