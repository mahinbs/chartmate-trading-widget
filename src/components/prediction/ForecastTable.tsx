import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { fmt, fmtPct, asNumber } from "@/lib/utils"
import { calculateHorizonTime, formatTargetTime, getShortHorizonLabel } from "@/lib/time"

interface Forecast {
  horizon: string
  direction: "up" | "down" | "sideways"
  probabilities: { up: number; down: number; sideways: number }
  expected_return_bp: number
  confidence: number
  key_drivers?: string[]
  risk_flags?: string[]
}

interface ForecastTableProps {
  forecasts: Forecast[]
  predictedAt?: Date | null
  marketTimeZone?: string | null
}

export function ForecastTable({ forecasts, predictedAt, marketTimeZone }: ForecastTableProps) {
  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'up': return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'down': return 'bg-red-500/10 text-red-600 border-red-500/20'
      default: return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }
  }

  const getHorizonLabel = (horizon: string) => {
    const minutes = parseInt(horizon)
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`
    if (minutes < 10080) return `${Math.round(minutes / 1440)}d`
    return `${Math.round(minutes / 10080)}w`
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Timeframe</TableHead>
            <TableHead className="font-semibold">Direction</TableHead>
            <TableHead className="font-semibold">Expected Return</TableHead>
            <TableHead className="font-semibold">Confidence</TableHead>
            <TableHead className="font-semibold">Probability Distribution</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {forecasts.map((forecast, index) => (
            <TableRow key={index} className="hover:bg-muted/30">
              <TableCell className="font-mono font-medium">
                {predictedAt ? (
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {formatTargetTime(calculateHorizonTime(forecast.horizon, predictedAt), marketTimeZone)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getShortHorizonLabel(forecast.horizon)}
                    </div>
                  </div>
                ) : (
                  getHorizonLabel(forecast.horizon)
                )}
              </TableCell>
              <TableCell>
                <Badge className={getDirectionColor(forecast.direction)}>
                  {forecast.direction.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="font-mono">
                <span className={forecast.expected_return_bp > 0 ? 'text-green-600' : 'text-red-600'}>
                  {fmtPct(asNumber(forecast.expected_return_bp) / 100)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={asNumber(forecast.confidence)} className="w-16 h-2" />
                  <span className="text-sm font-mono">{fmtPct(asNumber(forecast.confidence))}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-600 w-8">↑</span>
                    <Progress value={asNumber(forecast.probabilities.up) * 100} className="w-12 h-1" />
                    <span className="text-green-600 font-mono w-10">
                      {fmtPct(asNumber(forecast.probabilities.up) * 100, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-600 w-8">↓</span>
                    <Progress value={asNumber(forecast.probabilities.down) * 100} className="w-12 h-1" />
                    <span className="text-red-600 font-mono w-10">
                      {fmtPct(asNumber(forecast.probabilities.down) * 100, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-yellow-600 w-8">→</span>
                    <Progress value={asNumber(forecast.probabilities.sideways) * 100} className="w-12 h-1" />
                    <span className="text-yellow-600 font-mono w-10">
                      {fmtPct(asNumber(forecast.probabilities.sideways) * 100, 0)}
                    </span>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}