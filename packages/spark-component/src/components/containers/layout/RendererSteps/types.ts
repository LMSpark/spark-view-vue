/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSteps/types
 * 职责：集中定义 RendererSteps（r-steps）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/layout-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer steps 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
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
