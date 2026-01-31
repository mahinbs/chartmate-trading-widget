import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Lightbulb, AlertTriangle, Target, TrendingUp } from "lucide-react"
import { formatKeyDriver, formatPattern } from "@/lib/display-utils"

interface InsightsProps {
  keyDrivers?: string[]
  riskFlags?: string[]
  opportunities?: string[]
  rationale?: string
  patterns?: string[]
}

export function Insights({ 
  keyDrivers = [], 
  riskFlags = [], 
  opportunities = [], 
  rationale,
  patterns = []
}: InsightsProps) {
  return (
    <div className="space-y-6">
      {/* AI Rationale */}
      {rationale && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-blue-600" />
              AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{rationale}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Key Drivers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Key Drivers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {keyDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No key drivers identified</p>
            ) : (
              <div className="space-y-2">
                {keyDrivers.map((driver, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">{formatKeyDriver(driver)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk Flags */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No major risk factors identified</p>
            ) : (
              <div className="space-y-2">
                {riskFlags.map((risk, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-red-600 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">{formatKeyDriver(risk)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Opportunities & Patterns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {opportunities.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-blue-600" />
                Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {opportunities.map((opportunity, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">{formatKeyDriver(opportunity)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {patterns.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                Patterns Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {patterns.map((pattern, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {formatPattern(pattern)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}