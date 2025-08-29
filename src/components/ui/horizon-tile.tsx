import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface HorizonTileProps {
  horizon: string
  shortHorizon?: string
  direction: "up" | "down" | "sideways"
  expectedReturn: number
  confidence: number
  timeRemaining: string
  isExpired: boolean
}

export function HorizonTile({
  horizon,
  shortHorizon,
  direction,
  expectedReturn,
  confidence,
  timeRemaining,
  isExpired
}: HorizonTileProps) {
  const directionConfig = {
    up: {
      icon: TrendingUp,
      gradient: "from-trading-green/20 to-trading-green/5",
      border: "border-trading-green/30",
      glow: "shadow-lg shadow-trading-green/20",
      emoji: "↗️"
    },
    down: {
      icon: TrendingDown, 
      gradient: "from-trading-red/20 to-trading-red/5",
      border: "border-trading-red/30",
      glow: "shadow-lg shadow-trading-red/20",
      emoji: "↘️"
    },
    sideways: {
      icon: Minus,
      gradient: "from-primary/20 to-primary/5", 
      border: "border-primary/30",
      glow: "shadow-lg shadow-primary/20",
      emoji: "↔️"
    }
  }

  const config = directionConfig[direction]
  const Icon = config.icon

  return (
    <div className={cn(
      "relative group overflow-hidden rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02]",
      "bg-gradient-to-br backdrop-blur-sm",
      isExpired ? "from-muted/20 to-muted/5 border-muted/20" : config.gradient,
      isExpired ? "" : config.border,
      isExpired ? "" : config.glow
    )}>
      {/* Animated background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative space-y-3">
        {/* Header with horizon and status */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Badge 
              variant={isExpired ? "outline" : "secondary"}
              className={cn(
                "font-mono text-xs",
                !isExpired && "bg-gradient-to-r from-background/50 to-background/20 border-white/20"
              )}
            >
              {horizon}
            </Badge>
            {shortHorizon && (
              <div className="text-xs text-muted-foreground font-mono">
                {shortHorizon}
              </div>
            )}
          </div>
          
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            isExpired ? "text-muted-foreground" : "text-foreground"
          )}>
            <Icon className="h-3 w-3" />
            {config.emoji}
          </div>
        </div>

        {/* Prediction details */}
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {expectedReturn >= 0 ? "+" : ""}{expectedReturn.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground">expected</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {confidence}% confidence
            </span>
            <div className="text-right">
              <div className={cn(
                "font-mono text-sm font-medium",
                isExpired ? "text-trading-red" : "text-primary"
              )}>
                {timeRemaining}
              </div>
              <div className="text-xs text-muted-foreground">
                {isExpired ? "results ready" : "remaining"}
              </div>
            </div>
          </div>
        </div>

        {/* Progress indicator for non-expired tiles */}
        {!isExpired && (
          <div className="w-full h-1 bg-muted/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full animate-pulse"
              style={{ width: `${Math.min(confidence, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}