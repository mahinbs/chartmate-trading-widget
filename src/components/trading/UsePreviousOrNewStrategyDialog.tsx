import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lastStrategyLabel: string;
  symbol: string;
  action: string;
  onUsePrevious: () => void;
  onChooseNew: () => void;
}

export function UsePreviousOrNewStrategyDialog({
  open, onOpenChange, lastStrategyLabel, symbol, action, onUsePrevious, onChooseNew,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Strategy for this order</DialogTitle>
          <DialogDescription>
            Use your previous strategy for this {action} {symbol} order, or pick a new one with full market research and AI suggestions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            className="w-full justify-start gap-3"
            variant="outline"
            onClick={() => {
              onUsePrevious();
              onOpenChange(false);
            }}
          >
            <History className="h-5 w-5 shrink-0" />
            <span>Use previous: <strong>{lastStrategyLabel}</strong></span>
          </Button>
          <Button
            className="w-full justify-start gap-3"
            onClick={() => {
              onChooseNew();
              onOpenChange(false);
            }}
          >
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>Choose new strategy (AI + market research)</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
