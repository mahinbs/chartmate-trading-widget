import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Minus, Clock, Eye } from "lucide-react"
import { OutcomeBadge } from "./OutcomeBadge"
import { cn } from "@/lib/utils"

interface PredictionTileProps {
  prediction: {
    id: string
    symbol: string
    timeframe: string
    expected_move_direction: string | null
    expected_move_percent: number | null
    confidence: number | null
    created_at: string
    current_price: number | null
    raw_response?: any
  }
  timeRemaining: number
  isExpired: boolean
  outcome: 'accurate' | 'partial' | 'failed' | 'pending' | 'inconclusive'
  isAnalyzing: boolean
  onViewDetails: () => void
  onAnalyze?: () => void
}

export function PredictionTile({
  prediction,
  timeRemaining,
  isExpired,
  outcome,
  isAnalyzing,
  onViewDetails,
  onAnalyze
}: PredictionTileProps) {
  const direction = prediction.expected_move_direction as "up" | "down" | "sideways" || "sideways"
  
  // Fallback to raw_response for expected_move_percent if null
  let expectedReturn = prediction.expected_move_percent
  if (expectedReturn === null && prediction.raw_response?.expectedMove?.percent !== undefined) {
    expectedReturn = prediction.raw_response.expectedMove.percent
  }
  expectedReturn = expectedReturn || 0
  
  const confidence = prediction.confidence || 0

  const directionConfig = {
    up: {
      icon: TrendingUp,
      gradient: "from-trading-green/30 via-trading-green/10 to-background",
      border: "border-trading-green/40",
      text: "text-trading-green",
      emoji: "📈"
    },
    down: {
      icon: TrendingDown,
      gradient: "from-trading-red/30 via-trading-red/10 to-background",
      border: "border-trading-red/40", 
      text: "text-trading-red",
      emoji: "📉"
    },
    sideways: {
      icon: Minus,
      gradient: "from-primary/30 via-primary/10 to-background",
      border: "border-primary/40",
      text: "text-primary",
      emoji: "↔️"
    }
  }

  const config = directionConfig[direction]
  const Icon = config.icon

  const formatTimeRemaining = (ms: number) => {
    if (ms < 0) return "Expired"
    
    const totalSeconds = Math.floor(ms / 1000)
    const days = Math.floor(totalSeconds / (24 * 60 * 60))
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatCreatedDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer",
        "aspect-square",
        "bg-gradient-to-br border-2",
        isExpired ? "from-muted/20 to-muted/5 border-muted/30" : config.gradient,
        isExpired ? "" : config.border,
        isExpired ? "" : "shadow-lg hover:shadow-xl"
      )}
      onClick={onViewDetails}
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <CardContent className="p-4 h-full flex flex-col relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg truncate">{prediction.symbol}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {prediction.timeframe}
              </Badge>
              <div className={cn("flex items-center gap-1", config.text)}>
                <Icon className="h-3 w-3" />
                <span className="text-xs">{config.emoji}</span>
              </div>
            </div>
          </div>
          <OutcomeBadge outcome={outcome} />
        </div>

        {/* Prediction Details */}
        <div className="flex-1 space-y-2">
          <div className="text-center">
            <div className={cn("text-2xl font-bold", config.text)}>
              {expectedReturn >= 0 ? "+" : ""}{expectedReturn.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">expected move</div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-medium">{confidence}%</span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span className="font-mono text-xs">
                {formatCreatedDate(prediction.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Timer/Status */}
        <div className="space-y-3">
          <div className="text-center">
            <div className={cn(
              "font-mono text-sm font-medium",
              isExpired ? "text-trading-red" : "text-foreground"
            )}>
              {isExpired ? "Expired" : formatTimeRemaining(timeRemaining)}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              {isExpired ? "Analysis ready" : "remaining"}
            </div>
          </div>

          {/* Action Button */}
          <Button 
            variant={isExpired && !isAnalyzing ? "default" : "outline"}
            size="sm" 
            className="w-full"
            onClick={(e) => {
              e.stopPropagation()
              if (isExpired && outcome === 'pending' && !isAnalyzing && onAnalyze) {
                onAnalyze()
              } else {
                onViewDetails()
              }
            }}
          >
            {isAnalyzing ? (
              "Analyzing..."
            ) : isExpired && outcome === 'pending' ? (
              "Analyze Result"
            ) : (
              <>
                <Eye className="h-3 w-3 mr-1" />
                View Details
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}