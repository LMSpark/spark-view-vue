export type RendererStepsApi = {
  getActiveStep(): string | number | undefined
  getActiveStepIndex(): number
  setActiveStep(index: number): void
  nextStep(): void
  prevStep(): void
  getStepCount(): number
  getStepNames(): Array<string | number>
  isFirstStep(): boolean
  isLastStep(): boolean
}
