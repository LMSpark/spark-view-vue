/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSteps/types
 * RendererSteps 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RendererStepsApi（共 1 个 symbol）。
 */
/** Renderer Steps Api 的语义模型。 */
export type RendererStepsApi = {
  getActiveStep(): string | number | undefined
  getActiveStepIndex(): number
  setActiveStep(index: number): void
  nextStep(): void
  prevStep(): void
  getStepCount(): number
  getStepNames(): Array<string | number>
  isFirstStep(): boolean
  isLastStep(): boolean}
