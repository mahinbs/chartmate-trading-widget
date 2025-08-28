import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepperProps {
  steps: Array<{
    id: string
    title: string
    description?: string
  }>
  currentStep: string
  completedSteps: string[]
  className?: string
}

export function Stepper({ steps, currentStep, completedSteps, className }: StepperProps) {
  const currentIndex = steps.findIndex(step => step.id === currentStep)
  const isStepCompleted = (stepId: string) => completedSteps.includes(stepId)
  const isStepCurrent = (stepId: string) => stepId === currentStep
  const isStepUpcoming = (stepIndex: number) => stepIndex > currentIndex

  return (
    <div className={cn("w-full", className)}>
      <div className={cn(
        "flex items-center",
        className?.includes('mobile-stepper') 
          ? "overflow-x-auto pb-2 gap-4" 
          : "justify-between"
      )}>
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(step.id)
          const isCurrent = isStepCurrent(step.id)
          const isUpcoming = isStepUpcoming(index)

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 transition-colors shrink-0",
                    className?.includes('mobile-stepper') ? "w-8 h-8" : "w-10 h-10",
                    {
                      "bg-primary border-primary text-primary-foreground": isCompleted,
                      "bg-primary/10 border-primary text-primary": isCurrent,
                      "bg-muted border-muted-foreground/30 text-muted-foreground": isUpcoming,
                    }
                  )}
                >
                  {isCompleted ? (
                    <Check className={cn(className?.includes('mobile-stepper') ? "w-4 h-4" : "w-5 h-5")} />
                  ) : (
                    <span className={cn("font-medium", className?.includes('mobile-stepper') ? "text-xs" : "text-sm")}>{index + 1}</span>
                  )}
                </div>
                <div className={cn("mt-2 text-center", className?.includes('mobile-stepper') ? "min-w-16" : "")}>
                  <p
                    className={cn(
                      "font-medium",
                      className?.includes('mobile-stepper') ? "text-xs" : "text-sm",
                      {
                        "text-foreground": isCompleted || isCurrent,
                        "text-muted-foreground": isUpcoming,
                      }
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && !className?.includes('mobile-stepper') && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
              {index < steps.length - 1 && !className?.includes('mobile-stepper') && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-4 transition-colors",
                    {
                      "bg-primary": index < currentIndex,
                      "bg-muted": index >= currentIndex,
                    }
                  )}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}