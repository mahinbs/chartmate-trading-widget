import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingUp, Activity, Target } from "lucide-react";
import { formatTechnicalFactor, formatKeyDriver } from "@/lib/display-utils";

interface AIReasoningDisplayProps {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  technicalFactors?: string[];
  fundamentalFactors?: string[];
  keyDrivers?: string[];
  oneLineSummary?: string;
}

export function AIReasoningDisplay({
  symbol,
  action,
  confidence,
  technicalFactors = [],
  fundamentalFactors = [],
  keyDrivers = [],
  oneLineSummary
}: AIReasoningDisplayProps) {
  
  // Generate one-line explanation if not provided
  const generateOneLiner = () => {
    if (oneLineSummary) return oneLineSummary;
    
    const primaryDriver = keyDrivers[0] ? formatKeyDriver(keyDrivers[0]) : 
                         technicalFactors[0] ? formatTechnicalFactor(technicalFactors[0]) : 
                         'favorable market conditions';
    const confidenceLevel = confidence >= 80 ? 'strong' : confidence >= 60 ? 'moderate' : 'weak';
    
    return `${action} signal generated with ${confidenceLevel} confidence due to ${primaryDriver.toLowerCase()}.`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          AI Reasoning
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Why the AI made this prediction
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        
        {/* One-Line Summary */}
        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="font-semibold text-base leading-relaxed">
            "{generateOneLiner()}"
          </p>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid md:grid-cols-2 gap-4">
          
          {/* Technical Factors */}
          {technicalFactors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <h4 className="font-semibold text-sm">Technical Factors</h4>
              </div>
              <ul className="space-y-1">
                {technicalFactors.slice(0, 5).map((factor, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span className="text-muted-foreground">{formatTechnicalFactor(factor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Drivers */}
          {keyDrivers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-green-500" />
                <h4 className="font-semibold text-sm">Key Drivers</h4>
              </div>
              <ul className="space-y-1">
                {keyDrivers.slice(0, 5).map((driver, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-green-500 font-bold">•</span>
                    <span className="text-muted-foreground">{formatKeyDriver(driver)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* Fundamentals */}
        {fundamentalFactors.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <h4 className="font-semibold text-sm">Fundamental Factors</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {fundamentalFactors.map((factor, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Explanation */}
        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <p className="font-semibold mb-1">ML Confidence Explanation:</p>
          <p className="text-muted-foreground">
            {confidence >= 80 && `High confidence - Multiple strong signals aligned with historical patterns showing ${confidence}% success rate in similar conditions.`}
            {confidence >= 60 && confidence < 80 && `Moderate confidence - Several positive indicators present, but some conflicting signals. ${confidence}% confidence based on pattern matching.`}
            {confidence < 60 && `Low confidence - Mixed or weak signals. Market conditions unclear. Only ${confidence}% confidence - consider waiting for better setup.`}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
