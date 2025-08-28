import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StepContainerProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  isActive?: boolean
}

export function StepContainer({ 
  title, 
  description, 
  children, 
  className,
  isActive = true 
}: StepContainerProps) {
  return (
    <Card className={cn(
      "transition-all duration-300",
      {
        "ring-2 ring-primary/50 shadow-lg": isActive,
        "opacity-50": !isActive
      },
      className
    )}>
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  )
}