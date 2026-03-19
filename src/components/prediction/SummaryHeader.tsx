import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { formatCurrency, formatPercentage } from "@/lib/display-utils"

interface SummaryHeaderProps {
  symbol: string
  currentPrice: number
  change: number
  changePercent: number
  recommendation?: string
  confidence?: number
}

export function SummaryHeader({ 
  symbol, 
  currentPrice, 
  change, 
  changePercent, 
  recommendation,
  confidence 
}: SummaryHeaderProps) {
  const getChangeIcon = () => {
    if (changePercent > 0) return <TrendingUp className="h-4 w-4" />
    if (changePercent < 0) return <TrendingDown className="h-4 w-4" />
    return <Minus className="h-4 w-4" />
  }

  const getChangeColor = () => {
    if (changePercent > 0) return "text-green-600"
    if (changePercent < 0) return "text-red-600"
    return "text-muted-foreground"
  }

  const getRecommendationColor = () => {
    if (recommendation === "bullish") return "bg-green-500/10 text-green-600 border-green-500/20"
    if (recommendation === "bearish") return "bg-red-500/10 text-red-600 border-red-500/20"
    return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg border w-full">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">{symbol}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className="text-base sm:text-lg font-semibold">{formatCurrency(currentPrice, 2)}</span>
            <div className={`flex items-center gap-1 ${getChangeColor()}`}>
              {getChangeIcon()}
              <span className="text-sm">
                {formatCurrency(Math.abs(change), 2)} ({formatPercentage(Math.abs(changePercent), 1, false)})
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        {recommendation && (
          <Badge className={getRecommendationColor()}>
            {recommendation}
          </Badge>
        )}
        {confidence && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="text-base sm:text-lg font-semibold">{formatPercentage(confidence, 1, false)}</p>
          </div>
        )}
      </div>
    </div>
  )
}